import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import type { Env } from "../config/env.js";

// One Redis connection for the process. Phase 4 hands this same URL to BullMQ (the publish queue).
@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get("REDIS_URL", { infer: true }), {
      // BullMQ needs this: a blocked queue command must wait for Redis to come back, not give up.
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    // Without a listener, a lost connection would crash the process with an unhandled 'error' event.
    this.client.on("error", (err) => this.logger.warn(`Redis: ${err.message}`));
  }

  // The very last shutdown step, so services that still need Redis while stopping
  // (onModuleDestroy: the worker's heartbeat, later the queue) can finish first.
  async onApplicationShutdown() {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
