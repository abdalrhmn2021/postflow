import { HttpException } from "@nestjs/common";
import { RateLimiter } from "../common/rate-limiter.js";
import type { RedisService } from "../redis/redis.service.js";
import { AuthLimits, DEFAULT_AUTH_LIMITS, LOGIN_ATTEMPTS } from "./auth-limits.service.js";

// A stand-in Redis that really counts, in memory. `down`: MULTI ... EXEC never answers.
function memoryRedis({ down = false } = {}) {
  const counts = new Map<string, number>();
  const client = {
    multi: () => {
      let key = "";
      const chain = {
        set: (k: string) => ((key = k), chain),
        incr: () => chain,
        exec: () => {
          if (down) return new Promise(() => {});
          const n = (counts.get(key) ?? 0) + 1;
          counts.set(key, n);
          return Promise.resolve([
            [null, "OK"],
            [null, n],
          ]);
        },
      };
      return chain;
    },
    ttl: () => Promise.resolve(42),
    del: (k: string) => Promise.resolve(Number(counts.delete(k))),
  };
  return { counts, redis: { client } as unknown as RedisService };
}

function limitsWith(redis: RedisService, overrides: Partial<typeof DEFAULT_AUTH_LIMITS> = {}) {
  return new AuthLimits(new RateLimiter(redis), { ...DEFAULT_AUTH_LIMITS, ...overrides });
}

async function errorOf(promise: Promise<unknown>) {
  return (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as HttpException | null;
}

describe("AuthLimits - login", () => {
  it(`lets attempt number ${LOGIN_ATTEMPTS} from one IP through and stops the next one with 429`, async () => {
    const limits = limitsWith(memoryRedis().redis);
    for (let i = 0; i < LOGIN_ATTEMPTS; i++) {
      await expect(limits.login("1.2.3.4", `user${i}@a.test`)).resolves.toBeUndefined();
    }
    const err = await errorOf(limits.login("1.2.3.4", "user@a.test"));
    expect(err?.getStatus()).toBe(429);
    expect(err?.getResponse()).toMatchObject({ code: "TOO_MANY_ATTEMPTS", retryAfter: 42 });
  });

  it("stops guessing one account's password from many IPs", async () => {
    const limits = limitsWith(memoryRedis().redis);
    const max = DEFAULT_AUTH_LIMITS.loginPerAccount.max;
    for (let i = 0; i < max; i++) {
      await limits.login(`10.0.0.${i}`, "owner@a.test");
    }
    const err = await errorOf(limits.login("10.0.1.1", "owner@a.test"));
    expect(err?.getStatus()).toBe(429);
    expect(err?.getResponse()).toMatchObject({ code: "TOO_MANY_ACCOUNT_ATTEMPTS" });

    // Another account isn't affected.
    await expect(limits.login("10.0.1.1", "other@a.test")).resolves.toBeUndefined();
  });

  it("starts the account's count again after a successful login", async () => {
    const limits = limitsWith(memoryRedis().redis, { loginPerAccount: { name: "acc", max: 2, windowSeconds: 900 } });
    await limits.login("10.0.0.1", "owner@a.test");
    await limits.login("10.0.0.2", "owner@a.test");
    await limits.loginSucceeded("owner@a.test");
    await expect(limits.login("10.0.0.3", "owner@a.test")).resolves.toBeUndefined();
  });

  it("keeps emails out of Redis keys", async () => {
    const { redis, counts } = memoryRedis();
    await limitsWith(redis).login("1.2.3.4", "owner@a.test");
    expect([...counts.keys()].join(" ")).not.toContain("owner@a.test");
  });

  it("lets the login through when Redis doesn't answer, instead of locking everyone out", async () => {
    const limits = limitsWith(memoryRedis({ down: true }).redis);
    const started = Date.now();
    await expect(limits.login("1.2.3.4", "owner@a.test")).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("AuthLimits - new accounts", () => {
  it("allows a few sign-ups an hour from one IP, then answers 429 TOO_MANY_SIGNUPS", async () => {
    const limits = limitsWith(memoryRedis().redis);
    for (let i = 0; i < DEFAULT_AUTH_LIMITS.signupPerIp.max; i++) {
      await limits.signup("1.2.3.4");
    }
    const err = await errorOf(limits.signup("1.2.3.4"));
    expect(err?.getStatus()).toBe(429);
    expect(err?.getResponse()).toMatchObject({ code: "TOO_MANY_SIGNUPS" });
    await expect(limits.signup("5.6.7.8")).resolves.toBeUndefined(); // another visitor
  });

  it("caps sign-ups on the whole site, even from many IPs", async () => {
    const limits = limitsWith(memoryRedis().redis, { signupTotal: { name: "all", max: 3, windowSeconds: 3600 } });
    for (let i = 0; i < 3; i++) await limits.signup(`10.0.0.${i}`);
    const err = await errorOf(limits.signup("10.0.0.99"));
    expect(err?.getResponse()).toMatchObject({ code: "TOO_MANY_SIGNUPS" });
  });

  it("doesn't count an IP's refused sign-ups against the whole site", async () => {
    const { redis, counts } = memoryRedis();
    const limits = limitsWith(redis, { signupPerIp: { name: "ip", max: 1, windowSeconds: 3600 } });
    await limits.signup("1.2.3.4");
    for (let i = 0; i < 5; i++) await errorOf(limits.signup("1.2.3.4"));
    expect(counts.get(`${DEFAULT_AUTH_LIMITS.signupTotal.name}:all`)).toBe(1);
  });
});
