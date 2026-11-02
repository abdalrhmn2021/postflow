import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "../config/env.js";

export const PUBLISH_QUEUE = "publish";
// Tries per post: the first, then 3 more - after 1, 2 and 4 minutes - while Meta is busy or down.
export const PUBLISH_ATTEMPTS = 4;

// One job = "publish this post at this time". `at` is part of the job: if the post is moved to
// another time, the old job finds a different time on the post and does nothing.
export type PublishJob = { postId: string; at: number };

// BullMQ's own key prefix (it refuses ioredis' keyPrefix): "prod:bull:publish:..." - so development's
// worker never takes production's jobs, even on the same Redis database. Queue and worker must agree.
export const queuePrefix = (redisPrefix: string) => `${redisPrefix}:bull`;

// Job ids can't contain ":" - one id per post AND time, so scheduling twice adds one job.
export const publishJobId = (postId: string, at: number) => `${postId}-${at}`;

// Puts posts on the publish queue (Redis, BullMQ) as DELAYED jobs: each waits in Redis until its
// time, and only then does the worker take it. So nothing polls the database every minute - Neon's
// free database can sleep, and Upstash's free Redis isn't spent on "anything due yet?".
// The database stays the truth: the worker checks the post again before publishing anything.
@Injectable()
export class PublishQueue implements OnModuleDestroy {
  private readonly logger = new Logger(PublishQueue.name);
  readonly queue: Queue<PublishJob>;

  constructor(config: ConfigService<Env, true>) {
    // A connection of its own: BullMQ needs maxRetriesPerRequest: null (wait for Redis, don't give up).
    const connection = new Redis(config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    connection.on("error", () => undefined); // RedisService already reports a lost connection
    this.queue = new Queue<PublishJob>(PUBLISH_QUEUE, {
      connection,
      prefix: queuePrefix(config.get("REDIS_PREFIX", { infer: true })),
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }

  // Never throws: if Redis is down, the post is still scheduled in the database, and the worker's
  // sweep (at start and every hour) puts it on the queue later.
  async add(post: { id: string; scheduledAt: Date }) {
    const at = post.scheduledAt.getTime();
    try {
      await this.queue.add(
        "publish",
        { postId: post.id, at },
        {
          jobId: publishJobId(post.id, at),
          delay: Math.max(0, at - Date.now()),
          attempts: PUBLISH_ATTEMPTS,
          backoff: { type: "exponential", delay: 60_000 },
          removeOnComplete: { age: 7 * 24 * 3600 }, // keep a week of history, then let Redis forget
          removeOnFail: { age: 30 * 24 * 3600 },
        },
      );
    } catch (err) {
      this.logger.warn(`Couldn't queue post ${post.id} (the sweep will): ${(err as Error).message}`);
    }
  }

  // The post was unscheduled or moved: drop its waiting job. Best effort - a job left behind finds
  // the post changed and does nothing.
  async remove(post: { id: string; scheduledAt: Date | null }) {
    if (!post.scheduledAt) return;
    await this.queue.remove(publishJobId(post.id, post.scheduledAt.getTime())).catch(() => undefined);
  }
}
