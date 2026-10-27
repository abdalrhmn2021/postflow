import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { HEARTBEAT_KEY } from "../worker/heartbeat.js";

type Check = "up" | "down";

// 5 s, not less: a cloud database that sleeps when idle (Neon free plan) needs a moment to wake up.
const CHECK_TIMEOUT_MS = 5000;

// Resolves 'up' if the check finishes in time, 'down' if it throws or takes too long.
async function probe(check: () => Promise<unknown>): Promise<Check> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return "up";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/health - used by the host (Render, a VPS monitor) and by CI.
// 200 when the database and Redis answer, 503 when one of them doesn't.
// The worker's state is reported but never fails the check: the API can serve pages without it.
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      probe(() => this.prisma.$queryRaw`SELECT 1`),
      probe(() => this.redis.client.ping()),
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
