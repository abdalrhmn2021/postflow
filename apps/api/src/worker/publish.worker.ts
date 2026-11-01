import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "../config/env.js";
import { PostStatus } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PUBLISH_QUEUE, PublishQueue, publishJobId, type PublishJob } from "../publish/publish.queue.js";
import { PublisherService, type PublishResult } from "../publish/publisher.service.js";

const SWEEP_EVERY_MS = 60 * 60_000;
const SWEEP_LIMIT = 1000;

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
  ) {}

  async onApplicationBootstrap() {
    const connection = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    connection.on("error", () => undefined); // RedisService already reports a lost connection

    this.worker = new Worker<PublishJob, PublishResult>(PUBLISH_QUEUE, (job) => this.process(job), {
      connection,
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

  // The safety net: every scheduled post gets its job, even one scheduled while Redis was down, or
  // whose job Redis lost. Adding a job that already exists does nothing, so this is safe to repeat.
  // A job that already ran (failed or completed) for a post that is still SCHEDULED is stale: replaced.
  async sweep() {
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
}
