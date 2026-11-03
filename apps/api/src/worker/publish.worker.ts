import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "../config/env.js";
import { PostStatus } from "../generated/prisma/client.js";
import { TokenCipher } from "../meta/token-cipher.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PUBLISH_QUEUE, PublishQueue, publishJobId, queuePrefix, type PublishJob } from "../publish/publish.queue.js";
import { PublisherService, type PublishResult } from "../publish/publisher.service.js";

const SWEEP_EVERY_MS = 60 * 60_000;
const SWEEP_LIMIT = 1000;
// PUBLISHING this long with no job on it = stuck. Well past one normal try (a few minutes), and the
// job's state is checked too, so a slow publish that is still going is never touched.
export const STUCK_AFTER_MS = 30 * 60_000;
export const INTERRUPTED =
  "Publishing stopped half-way (the server restarted). Check the client's page before publishing " +
  "again: it may already be there.";
// Job states that mean "a worker is on it, or will be".
const WORKING = new Set(["active", "delayed", "waiting", "waiting-children", "prioritized"]);

// Takes publish jobs off the queue when their time comes, and publishes the posts.
//
// Settings chosen for free Redis plans (Upstash counts every command):
//   drainDelay 300      an idle worker asks Redis "anything?" every 5 minutes, not every 5 seconds.
//                       A delayed job still starts on time: BullMQ wakes the worker for it.
//   stalledInterval 5m  how often it checks for jobs a crashed worker left half-done
//   lockDuration 2m     an Instagram video can take minutes to prepare; the lock is renewed meanwhile
@Injectable()
export class PublishWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PublishWorker.name);
  private worker?: Worker<PublishJob, PublishResult>;
  private sweepTimer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly publisher: PublisherService,
    private readonly queue: PublishQueue,
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipher,
  ) {}

  async onApplicationBootstrap() {
    const connection = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    connection.on("error", () => undefined); // RedisService already reports a lost connection

    this.worker = new Worker<PublishJob, PublishResult>(PUBLISH_QUEUE, (job) => this.process(job), {
      connection,
      prefix: queuePrefix(this.config.get("REDIS_PREFIX", { infer: true })),
      concurrency: 3,
      drainDelay: 300,
      stalledInterval: 5 * 60_000,
      lockDuration: 2 * 60_000,
    });
    this.worker.on("completed", (job, result) => this.logger.log(`Post ${job.data.postId}: ${result}`));
    this.worker.on("failed", (job, err) => {
      if (job) this.logger.warn(`Post ${job.data.postId}, try ${job.attemptsMade}: ${err.message}`);
    });
    this.worker.on("error", (err) => this.logger.error(`Publish worker: ${err.message}`));

    await this.sweep();
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.logger.log("Publish queue running");
  }

  async onModuleDestroy() {
    clearInterval(this.sweepTimer);
    await this.worker?.close(); // waits for the posts being published right now
  }

  private process(job: Job<PublishJob, PublishResult>) {
    const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    return this.publisher.publish(job.data.postId, job.data.at, lastAttempt);
  }

  // At start and every hour. Each part on its own: one failing doesn't stop the others.
  async sweep() {
    await this.queueScheduled();
    await this.failStuck();
    await this.reencryptTokens();
  }

  // The safety net: every scheduled post gets its job, even one scheduled while Redis was down, or
  // whose job Redis lost. Adding a job that already exists does nothing, so this is safe to repeat.
  // A job that already ran (failed or completed) for a post that is still SCHEDULED is stale: replaced.
  private async queueScheduled() {
    try {
      const posts = await this.prisma.post.findMany({
        where: { status: PostStatus.SCHEDULED, scheduledAt: { not: null } },
        select: { id: true, scheduledAt: true },
        orderBy: { scheduledAt: "asc" },
        take: SWEEP_LIMIT,
      });
      for (const post of posts) {
        const scheduledAt = post.scheduledAt!;
        const job = await this.queue.queue.getJob(publishJobId(post.id, scheduledAt.getTime()));
        if (job && ((await job.isFailed()) || (await job.isCompleted()))) await job.remove();
        await this.queue.add({ id: post.id, scheduledAt });
      }
      if (posts.length > 0) this.logger.log(`Sweep: ${posts.length} scheduled post(s) on the queue`);
    } catch (err) {
      this.logger.warn(`Sweep failed (next one in an hour): ${(err as Error).message}`);
    }
  }

  // A post left PUBLISHING with no job working on it: the server stopped half-way and Redis lost the
  // job, or the last try crashed before it could write FAILED. Nothing would ever pick it up again,
  // and the website refuses to change a PUBLISHING post - so it would be stuck for good.
  //
  // It becomes FAILED, NOT published again automatically: Meta may have published it just before the
  // stop, without us writing that down - sending it again would post it twice on the client's page.
  // The platforms we know went out stay recorded; publishing again after a look sends the others only.
  //
  // "No job working on it" = its job is gone, failed or done. An active, delayed (waiting to retry)
  // or waiting job is still on it - even a slow one (big Instagram videos) - so it's left alone.
  // A crashed worker's active job is BullMQ's to restart (stalled jobs), not ours.
  private async failStuck() {
    try {
      const cutoff = new Date(Date.now() - STUCK_AFTER_MS);
      const posts = await this.prisma.post.findMany({
        where: { status: PostStatus.PUBLISHING, updatedAt: { lt: cutoff } },
        select: { id: true, scheduledAt: true },
        take: SWEEP_LIMIT,
      });
      let failed = 0;
      for (const post of posts) {
        if (post.scheduledAt) {
          const job = await this.queue.queue.getJob(publishJobId(post.id, post.scheduledAt.getTime()));
          if (job && WORKING.has(await job.getState())) continue;
        }
        // Still PUBLISHING and still old: a try that started a moment ago changed updatedAt.
        const { count } = await this.prisma.post.updateMany({
          where: { id: post.id, status: PostStatus.PUBLISHING, updatedAt: { lt: cutoff } },
          data: { status: PostStatus.FAILED, failReason: INTERRUPTED },
        });
        failed += count;
      }
      if (failed > 0) this.logger.warn(`Sweep: ${failed} post(s) stuck publishing, now FAILED`);
    } catch (err) {
      this.logger.warn(`Stuck-post check failed (next one in an hour): ${(err as Error).message}`);
    }
  }

  // While TOKEN_ENCRYPTION_KEY is being changed: each page token still locked with the previous key
  // is encrypted again with the new one. When the log says "0 left", TOKEN_ENCRYPTION_KEY_PREVIOUS
  // can go. A token neither key opens is left as it is (publishing marks that page "connect again").
  private async reencryptTokens() {
    if (!this.cipher.rotating) return;
    try {
      const accounts = await this.prisma.socialAccount.findMany({ select: { brandId: true, pageToken: true } });
      let done = 0;
      let unreadable = 0;
      for (const { brandId, pageToken } of accounts) {
        let opened: { plain: string; old: boolean };
        try {
          opened = this.cipher.open(pageToken);
        } catch {
          unreadable++;
          continue;
        }
        if (!opened.old) continue;
        // Only if the token wasn't replaced meanwhile (the page connected again).
        const { count } = await this.prisma.socialAccount.updateMany({
          where: { brandId, pageToken },
          data: { pageToken: this.cipher.encrypt(opened.plain) },
        });
        done += count;
      }
      this.logger.log(
        `Key change: ${done} page token(s) re-encrypted with the new key, 0 left on the old one` +
          (unreadable > 0 ? `, ${unreadable} readable with neither key (those pages must connect again)` : ""),
      );
    } catch (err) {
      this.logger.warn(`Re-encrypting tokens failed (next try in an hour): ${(err as Error).message}`);
    }
  }
}
