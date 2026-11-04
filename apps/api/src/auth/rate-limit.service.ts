import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { RedisService } from "../redis/redis.service.js";

export const LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 60;
export const SIGNUP_WINDOW_SECONDS = 60 * 60;
export const MAIL_WINDOW_SECONDS = 60 * 60;
export const FORGOT_PER_IP = 5;
export const EMAILS_PER_ADDRESS = 3;
const REDIS_TIMEOUT_MS = 1000;

// One limit: at most `max` tries per `windowSeconds` from one IP. max 0 = no limit.
type Limit = { key: string; max: number; windowSeconds: number; code: string; message: string };

// Limits, so a script can't hammer the forms:
//   login            5 a minute per IP - a password can't be guessed by trying thousands
//   sign-up          SIGNUPS_PER_HOUR an hour per IP (10 in production) - no fake agencies
//   forgot password  5 an hour per IP, and 3 emails an hour to one address
//   confirm email    3 resends an hour per person
//   change password  5 tries of the current password in 15 minutes per person
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

  // "Forgot password" from one IP: 5 an hour (429 - the visitor sees it).
  forgotPassword(ip: string): Promise<void> {
    return this.hit(ip, {
      key: "forgot-ip",
      max: FORGOT_PER_IP,
      windowSeconds: MAIL_WINDOW_SECONDS,
      code: "TOO_MANY_EMAILS",
      message: "Too many emails asked for, try again later",
    });
  }

  // Emails to one address: 3 an hour, whoever asks - nobody can fill a person's inbox with our emails.
  // false = over: skip the email, but answer as usual (the answer must not tell if the email has an account).
  emailTo(address: string): Promise<boolean> {
    return this.allowed(address, { key: "mail-to", max: EMAILS_PER_ADDRESS, windowSeconds: MAIL_WINDOW_SECONDS });
  }

  // "Send the confirmation again", by one person: 3 an hour (429).
  verifyEmail(userId: string): Promise<void> {
    return this.hit(userId, {
      key: "verify-mail",
      max: EMAILS_PER_ADDRESS,
      windowSeconds: MAIL_WINDOW_SECONDS,
      code: "TOO_MANY_EMAILS",
      message: "Too many emails asked for, try again later",
    });
  }

  // The current password checked when changing it: 5 tries in 15 minutes per person, so someone at an
  // unlocked computer can't guess it to take the account over.
  passwordCheck(userId: string): Promise<void> {
    return this.hit(userId, {
      key: "password-check",
      max: LOGIN_ATTEMPTS,
      windowSeconds: 15 * 60,
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many tries, wait a few minutes",
    });
  }

  private async hit(who: string, limit: Limit): Promise<void> {
    const key = `${limit.key}:${who}`;
    if (!(await this.allowed(who, limit))) {
      const retryAfter = await this.redis.client.ttl(key).catch(() => limit.windowSeconds);
      throw new HttpException({ code: limit.code, message: limit.message, retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  // Counts one more try; false once there are more than `max` in the window.
  private async allowed(who: string, limit: Pick<Limit, "key" | "max" | "windowSeconds">): Promise<boolean> {
    if (limit.max === 0) return true;
    try {
      return (await withTimeout(this.countAttempt(`${limit.key}:${who}`, limit.windowSeconds))) <= limit.max;
    } catch (err) {
      // Redis down: let the person through rather than lock everyone out. Logged so it gets noticed.
      this.logger.warn(
        `${limit.key} limit skipped, Redis didn't answer: ${err instanceof Error ? err.message : String(err)}`,
      );
      return true;
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
