import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { RedisService } from "../src/redis/redis.service.js";
import { HEARTBEAT_KEY } from "../src/worker/heartbeat.js";
import { startApp } from "./app.js";

describe("GET /api/health", () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app?.close();
  });

  it("is ok when the database and Redis answer", async () => {
    app = await startApp();
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks).toEqual({ database: "up", redis: "up" });
  });

  it("reports the worker as up while its heartbeat key exists", async () => {
    app = await startApp();
    const redis = app.get(RedisService).client;
    await redis.set(HEARTBEAT_KEY, "2026-10-27T12:00:00.000Z", "EX", 30);
    try {
      const res = await request(app.getHttpServer()).get("/api/health").expect(200);
      expect(res.body.worker).toEqual({ status: "up", lastHeartbeat: "2026-10-27T12:00:00.000Z" });
    } finally {
      await redis.del(HEARTBEAT_KEY);
    }
  });

  it("answers 503 and names the part that is down", async () => {
    // A Redis that never answers: the check must fail fast, not hang the request.
    const deadRedis = {
      client: { ping: () => Promise.reject(new Error("down")), get: () => Promise.resolve(null) },
      onApplicationShutdown: () => Promise.resolve(),
    };
    app = await startApp((b) => b.overrideProvider(RedisService).useValue(deadRedis));
    const res = await request(app.getHttpServer()).get("/api/health").expect(503);
    expect(res.body.status).toBe("error");
    expect(res.body.checks).toEqual({ database: "up", redis: "down" });
  });
});
