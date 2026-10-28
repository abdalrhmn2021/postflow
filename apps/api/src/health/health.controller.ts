import { Controller, Get, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { HEARTBEAT_KEY } from "../worker/heartbeat.js";
import { Public } from "../auth/decorators.js";

type Check = "up" | "down";

// 5 s, not less: a cloud database that sleeps when idle (Neon free plan) needs a moment to wake up.
const CHECK_TIMEOUT_MS = 5000;

const logger = new Logger("HealthCheck");
// Last failure message per check, so a check that keeps failing is logged once, not every 10 s.
const lastError = new Map<string, string>();

// Resolves 'up' if the check finishes in time, 'down' if it throws or takes too long.
// The reason for a 'down' goes to the API's terminal (never to the browser: it can contain hostnames).
async function probe(name: string, check: () => Promise<unknown>): Promise<Check> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    if (lastError.delete(name)) logger.log(`${name} is back up`);
    return "up";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (lastError.get(name) !== message) {
      lastError.set(name, message);
      logger.warn(`${name} check failed: ${message}`);
    }
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/health - used by the host (Render, a VPS monitor) and by CI.
// 200 when the database and Redis answer, 503 when one of them doesn't.
// The worker's state is reported but never fails the check: the API can serve pages without it.
@Public() // the host and CI call it without logging in
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      probe("database", () => this.prisma.$queryRaw`SELECT 1`),
      probe("redis", () => this.redis.client.ping()),
    ]);
    const lastBeat = redis === "up" ? await this.redis.client.get(HEARTBEAT_KEY).catch(() => null) : null;

    const body = {
      status: database === "up" && redis === "up" ? "ok" : "error",
      checks: { database, redis },
      worker: lastBeat ? { status: "up", lastHeartbeat: lastBeat } : { status: "down" },
    };
    if (body.status !== "ok") throw new ServiceUnavailableException(body);
    return body;
  }
}
