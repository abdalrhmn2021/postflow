import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service.js";

const REDIS_TIMEOUT_MS = 1000;

// One limit: at most `max` hits per `windowSeconds`, counted per key.
export type Limit = { name: string; max: number; windowSeconds: number };

// Counts hits in Redis, not in memory: the count is shared if the API runs as several processes,
// and survives a restart. Each key's window starts at its first hit and ends on its own (Redis EX).
@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);

  constructor(private readonly redis: RedisService) {}

  // Counts one hit. null = still within the limit; a number = over it, seconds until the window ends.
  // Redis down: null (let the request through rather than lock everyone out), logged so it gets noticed.
  async hit(limit: Limit, key: string): Promise<number | null> {
    const redisKey = `${limit.name}:${key}`;
    let count: number;
    try {
      count = await withTimeout(this.count(redisKey, limit.windowSeconds));
    } catch (err) {
      this.logger.warn(
        `Limit ${limit.name} skipped, Redis didn't answer: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    if (count <= limit.max) return null;
    const ttl = await withTimeout(this.redis.client.ttl(redisKey)).catch(() => limit.windowSeconds);
    return ttl > 0 ? ttl : limit.windowSeconds;
  }

  // Starts the key's count again (e.g. after a successful login). Best effort.
  async reset(limit: Limit, key: string): Promise<void> {
    await withTimeout(this.redis.client.del(`${limit.name}:${key}`)).catch(() => undefined);
  }

  private async count(key: string, windowSeconds: number): Promise<number> {
    // SET ... NX starts the window on the first hit only; INCR keeps that expiry.
    const results = await this.redis.client.multi().set(key, 0, "EX", windowSeconds, "NX").incr(key).exec();
    const [err, count] = results?.[1] ?? [new Error("no reply"), 0];
    if (err) throw err;
    return Number(count);
  }
}

// The shared Redis client waits forever while Redis is down (the publish queue needs that),
// so a request must stop waiting on its own.
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), REDIS_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
