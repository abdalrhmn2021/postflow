import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { RedisService } from "../redis/redis.service.js";

export const LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 60;
export const SIGNUP_WINDOW_SECONDS = 60 * 60;
const REDIS_TIMEOUT_MS = 1000;

// One limit: at most `max` tries per `windowSeconds` from one IP. max 0 = no limit.
type Limit = { key: string; max: number; windowSeconds: number; code: string; message: string };

// Limits on the public forms, per IP, so a script can't hammer them:
//   login   5 a minute - a password can't be guessed by trying thousands
//   sign-up SIGNUPS_PER_HOUR an hour (10 in production) - nobody fills the site with fake agencies
// Counted in Redis, not in memory: the count is shared if the API runs as several processes,
// and survives a restart.
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly signupsPerHour: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<Env, true>,
  ) {
    this.signupsPerHour = config.get("SIGNUPS_PER_HOUR", { infer: true });
  }

  login(ip: string): Promise<void> {
    return this.hit(ip, {
      key: "login-attempts",
      max: LOGIN_ATTEMPTS,
      windowSeconds: LOGIN_WINDOW_SECONDS,
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many login attempts, try again in a minute",
    });
  }

  signup(ip: string): Promise<void> {
    return this.hit(ip, {
      key: "signups",
      max: this.signupsPerHour,
      windowSeconds: SIGNUP_WINDOW_SECONDS,
      code: "TOO_MANY_SIGNUPS",
      message: "Too many sign-ups from here, try again later",
    });
  }

  private async hit(ip: string, limit: Limit): Promise<void> {
    if (limit.max === 0) return;
    const key = `${limit.key}:${ip}`;
    let count: number;
    try {
      count = await withTimeout(this.countAttempt(key, limit.windowSeconds));
    } catch (err) {
      // Redis down: let the person through rather than lock everyone out. Logged so it gets noticed.
      this.logger.warn(
        `${limit.key} limit skipped, Redis didn't answer: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    if (count > limit.max) {
      const retryAfter = await this.redis.client.ttl(key).catch(() => limit.windowSeconds);
      throw new HttpException({ code: limit.code, message: limit.message, retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async countAttempt(key: string, windowSeconds: number): Promise<number> {
    // SET ... NX starts the window on the first attempt only; INCR keeps that expiry.
    const results = await this.redis.client.multi().set(key, 0, "EX", windowSeconds, "NX").incr(key).exec();
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
