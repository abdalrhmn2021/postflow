import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service.js";

export const LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 60;
const REDIS_TIMEOUT_MS = 1000;

// At most 5 login attempts per minute from one IP, so a password can't be guessed by trying thousands.
// Counted in Redis, not in memory: the count is shared if the API runs as several processes,
// and survives a restart.
@Injectable()
export class LoginLimitService {
  private readonly logger = new Logger(LoginLimitService.name);

  constructor(private readonly redis: RedisService) {}

  async hit(ip: string): Promise<void> {
    const key = `login-attempts:${ip}`;
    let count: number;
    try {
      count = await withTimeout(this.countAttempt(key));
    } catch (err) {
      // Redis down: let the login through rather than lock everyone out. Logged so it gets noticed.
      this.logger.warn(`Login limit skipped, Redis didn't answer: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (count > LOGIN_ATTEMPTS) {
      const retryAfter = await this.redis.client.ttl(key).catch(() => LOGIN_WINDOW_SECONDS);
      throw new HttpException(
        { code: "TOO_MANY_ATTEMPTS", message: "Too many login attempts, try again in a minute", retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async countAttempt(key: string): Promise<number> {
    // SET ... NX starts the one-minute window on the first attempt only; INCR keeps that expiry.
    const results = await this.redis.client.multi().set(key, 0, "EX", LOGIN_WINDOW_SECONDS, "NX").incr(key).exec();
    const [err, count] = results?.[1] ?? [new Error("no reply"), 0];
    if (err) throw err;
    return Number(count);
  }
}

// The shared Redis client waits forever while Redis is down (the publish queue needs that),
// so a login must stop waiting on its own.
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), REDIS_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
