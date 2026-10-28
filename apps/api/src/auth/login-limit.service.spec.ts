import { HttpException } from "@nestjs/common";
import type { RedisService } from "../redis/redis.service.js";
import { LOGIN_ATTEMPTS, LoginLimitService } from "./login-limit.service.js";

// A stand-in Redis whose MULTI ... EXEC answers with the given attempt count (or never answers).
function fakeRedis(exec: () => Promise<unknown>) {
  const chain = { set: () => chain, incr: () => chain, exec };
  return { client: { multi: () => chain, ttl: () => Promise.resolve(42) } } as unknown as RedisService;
}

describe("LoginLimitService", () => {
  it(`lets attempt number ${LOGIN_ATTEMPTS} through and stops the next one with 429`, async () => {
    const atLimit = new LoginLimitService(
      fakeRedis(() =>
        Promise.resolve([
          [null, "OK"],
          [null, LOGIN_ATTEMPTS],
        ]),
      ),
    );
    await expect(atLimit.hit("1.2.3.4")).resolves.toBeUndefined();

    const over = new LoginLimitService(
      fakeRedis(() =>
        Promise.resolve([
          [null, "OK"],
          [null, LOGIN_ATTEMPTS + 1],
        ]),
      ),
    );
    const err = (await over.hit("1.2.3.4").catch((e: unknown) => e)) as HttpException;
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse()).toMatchObject({ code: "TOO_MANY_ATTEMPTS", retryAfter: 42 });
  });

  it("lets the login through when Redis doesn't answer, instead of locking everyone out", async () => {
    const down = new LoginLimitService(fakeRedis(() => new Promise(() => {})));
    const started = Date.now();
    await expect(down.hit("1.2.3.4")).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
