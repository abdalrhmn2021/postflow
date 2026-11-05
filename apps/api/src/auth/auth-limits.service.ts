import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { RateLimiter, type Limit } from "../common/rate-limiter.js";

export type AuthLimitsConfig = {
  loginPerIp: Limit;
  loginPerAccount: Limit;
  signupPerIp: Limit;
  signupTotal: Limit;
  emailPerIp: Limit;
  emailPerAddress: Limit;
};

// Swapped in the e2e tests (test/app.ts): they sign up many agencies from one machine.
export const AUTH_LIMITS = Symbol("AUTH_LIMITS");

export const LOGIN_ATTEMPTS = 5;
export const LOGIN_WINDOW_SECONDS = 60;

export const DEFAULT_AUTH_LIMITS: AuthLimitsConfig = {
  // 5 a minute from one IP: a password can't be guessed by trying thousands from one machine.
  loginPerIp: { name: "login-attempts", max: LOGIN_ATTEMPTS, windowSeconds: LOGIN_WINDOW_SECONDS },
  // 10 per 15 minutes on one email, from anywhere. The IP alone isn't enough: someone with many IPs
  // (or who calls the API directly with a made-up X-Forwarded-For) could still guess one account's
  // password. Counted for every email, with or without an account, so it tells nobody which exist.
  // Cleared by a successful login, so the owner of the account isn't held back by their own typos.
  loginPerAccount: { name: "login-account", max: 10, windowSeconds: 15 * 60 },
  // New accounts (sign-up and accepting an invite): 5 an hour from one IP, and 100 an hour on the
  // whole site - so a script can't fill the database with fake agencies, even from many IPs.
  signupPerIp: { name: "signups", max: 5, windowSeconds: 60 * 60 },
  signupTotal: { name: "signups-all", max: 100, windowSeconds: 60 * 60 },
  // Emails someone asks for (forgot password, send the confirmation again): 10 an hour from one IP,
  // 3 an hour to one address - nobody can flood a person's inbox through us, or use up Brevo's
  // 300 a day. Counted for every address, with or without an account, so it tells nobody which exist.
  emailPerIp: { name: "emails", max: 10, windowSeconds: 60 * 60 },
  emailPerAddress: { name: "emails-to", max: 3, windowSeconds: 60 * 60 },
};

// The email as a short hash: Redis keys don't hold people's emails in plain text.
const emailKey = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 32);

const tooMany = (code: string, message: string, retryAfter: number) =>
  new HttpException({ code, message, retryAfter }, HttpStatus.TOO_MANY_REQUESTS);

// Limits on the routes anyone can call without logging in.
@Injectable()
export class AuthLimits {
  constructor(
    private readonly limiter: RateLimiter,
    @Inject(AUTH_LIMITS) private readonly limits: AuthLimitsConfig,
  ) {}

  // Before the database and the slow password check. 429 TOO_MANY_ATTEMPTS / TOO_MANY_ACCOUNT_ATTEMPTS.
  async login(ip: string, email: string): Promise<void> {
    const ipWait = await this.limiter.hit(this.limits.loginPerIp, ip);
    if (ipWait !== null) {
      throw tooMany("TOO_MANY_ATTEMPTS", "Too many login attempts, try again in a minute", ipWait);
    }
    const accountWait = await this.limiter.hit(this.limits.loginPerAccount, emailKey(email));
    if (accountWait !== null) {
      throw tooMany(
        "TOO_MANY_ACCOUNT_ATTEMPTS",
        "Too many login attempts on this account, try again later",
        accountWait,
      );
    }
  }

  loginSucceeded(email: string): Promise<void> {
    return this.limiter.reset(this.limits.loginPerAccount, emailKey(email));
  }

  // Before making an account. 429 TOO_MANY_SIGNUPS.
  async signup(ip: string): Promise<void> {
    const wait =
      (await this.limiter.hit(this.limits.signupPerIp, ip)) ?? (await this.limiter.hit(this.limits.signupTotal, "all"));
    if (wait !== null) throw tooMany("TOO_MANY_SIGNUPS", "Too many new accounts, try again later", wait);
  }

  // Before sending an email someone asked for. 429 TOO_MANY_EMAILS.
  async email(ip: string, address: string): Promise<void> {
    const wait =
      (await this.limiter.hit(this.limits.emailPerIp, ip)) ??
      (await this.limiter.hit(this.limits.emailPerAddress, emailKey(address)));
    if (wait !== null) throw tooMany("TOO_MANY_EMAILS", "Too many emails asked for, try again later", wait);
  }
}
