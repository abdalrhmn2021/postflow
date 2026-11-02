import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { hidePassword, type Env } from "../config/env.js";

// Why a connection failed, in words. On Windows "localhost" is tried as ::1 and 127.0.0.1, and
// when both refuse, the error is an AggregateError whose own message is EMPTY - the reason is
// in its inner errors' codes (ECONNREFUSED = nothing is listening on that port).
export function describeError(err: Error & { code?: string; errors?: Array<{ code?: string; message?: string }> }) {
  if (err.message) return err.message;
  const inner = err.errors?.map((e) => e.code ?? e.message).filter(Boolean) ?? [];
  return inner.length ? [...new Set(inner)].join(", ") : (err.code ?? err.name);
}

// One Redis connection for the process. Phase 4 hands this same URL to BullMQ (the publish queue).
// Its keys are prefixed ("prod:...") - see REDIS_PREFIX in config/env.ts.
@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  // Log a lost connection once, not on every retry (ioredis retries every few seconds).
  private down = false;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get("REDIS_URL", { infer: true });
    this.client = new Redis(url, {
      // BullMQ needs this: a blocked queue command must wait for Redis to come back, not give up.
      maxRetriesPerRequest: null,
      lazyConnect: false,
      // "dev:", "test:" or "prod:" before every key this client reads or writes - so one Redis database
      // can serve development and production apart. The queue has its own prefix (publish.queue.ts).
      keyPrefix: `${config.get("REDIS_PREFIX", { infer: true })}:`,
    });

    // Without an 'error' listener, a lost connection would crash the process.
    this.client.on("error", (err) => {
      if (this.down) return;
      this.down = true;
      // Never the password: these lines end up in the host's logs (Render), visible to anyone with access.
      const local = /^rediss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url);
      const hint = local
        ? `Is it running? Start Docker Desktop, then run "npm run db:up" in the project folder.`
        : `Check REDIS_URL (Upstash needs rediss://, and the password from its TOKEN button).`;
      this.logger.error(`Can't reach Redis at ${hidePassword(url)} (${describeError(err)}). ${hint} Retrying...`);
    });
    this.client.on("ready", () => {
      if (this.down) this.logger.log("Redis is back");
      this.down = false;
    });
  }

  // The very last shutdown step, so services that still need Redis while stopping
  // (onModuleDestroy: the worker's heartbeat, later the queue) can finish first.
  async onApplicationShutdown() {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
