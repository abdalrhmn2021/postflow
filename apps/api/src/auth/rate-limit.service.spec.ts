import { HttpException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { RedisService } from "../redis/redis.service.js";
import { LOGIN_ATTEMPTS, RateLimitService } from "./rate-limit.service.js";

// A stand-in Redis whose MULTI ... EXEC answers with the given attempt count (or never answers).
// `keys` collects the keys it was asked to count.
function fakeRedis(exec: () => Promise<unknown>, keys: string[] = []) {
  const chain = {
    set: (key: string) => {
      keys.push(key);
      return chain;
    },
    incr: () => chain,
    exec,
  };
  return { client: { multi: () => chain, ttl: () => Promise.resolve(42) } } as unknown as RedisService;
}

const counted = (n: number) => () =>
  Promise.resolve([
    [null, "OK"],
    [null, n],
  ]);

const config = (signupsPerHour: number) => ({ get: () => signupsPerHour }) as unknown as ConfigService<never, true>;

describe("RateLimitService.login", () => {
  it(`lets attempt number ${LOGIN_ATTEMPTS} through and stops the next one with 429`, async () => {
    await expect(
      new RateLimitService(fakeRedis(counted(LOGIN_ATTEMPTS)), config(10)).login("1.2.3.4"),
    ).resolves.toBeUndefined();

    const over = new RateLimitService(fakeRedis(counted(LOGIN_ATTEMPTS + 1)), config(10));
    const err = (await over.login("1.2.3.4").catch((e: unknown) => e)) as HttpException;
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse()).toMatchObject({ code: "TOO_MANY_ATTEMPTS", retryAfter: 42 });
  });

  it("lets the login through when Redis doesn't answer, instead of locking everyone out", async () => {
    const down = new RateLimitService(
      fakeRedis(() => new Promise(() => {})),
      config(10),
    );
    const started = Date.now();
    await expect(down.login("1.2.3.4")).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("RateLimitService.signup", () => {
  it("allows SIGNUPS_PER_HOUR sign-ups, then answers 429 TOO_MANY_SIGNUPS", async () => {
    await expect(new RateLimitService(fakeRedis(counted(3)), config(3)).signup("1.2.3.4")).resolves.toBeUndefined();

    const err = (await new RateLimitService(fakeRedis(counted(4)), config(3))
      .signup("1.2.3.4")
      .catch((e: unknown) => e)) as HttpException;
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse()).toMatchObject({ code: "TOO_MANY_SIGNUPS" });
  });

  it("counts sign-ups apart from logins", async () => {
    const keys: string[] = [];
    const limits = new RateLimitService(fakeRedis(counted(1), keys), config(3));
    await limits.signup("1.2.3.4");
    await limits.login("1.2.3.4");
    expect(keys).toEqual(["signups:1.2.3.4", "login-attempts:1.2.3.4"]);
  });

  it("SIGNUPS_PER_HOUR=0 turns the limit off - Redis isn't even asked", async () => {
    const keys: string[] = [];
    await new RateLimitService(fakeRedis(counted(1000), keys), config(0)).signup("1.2.3.4");
    expect(keys).toEqual([]);
  });
});
