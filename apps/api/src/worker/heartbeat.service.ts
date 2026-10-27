import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { RedisService } from "../redis/redis.service.js";
import { HEARTBEAT_EVERY_MS, HEARTBEAT_KEY, HEARTBEAT_TTL_SECONDS } from "./heartbeat.js";

// "I'm alive" for /api/health: the time of the last beat, kept for HEARTBEAT_TTL_SECONDS.
@Injectable()
export class HeartbeatService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly redis: RedisService) {}

  async onApplicationBootstrap() {
    await this.beat();
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_EVERY_MS);
  }

  // Runs before Redis closes (RedisService closes in onApplicationShutdown), so /health
  // sees the worker as down right away instead of after the key expires.
  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.redis.client.del(HEARTBEAT_KEY).catch(() => undefined);
  }

  private async beat() {
    try {
      await this.redis.client.set(HEARTBEAT_KEY, new Date().toISOString(), "EX", HEARTBEAT_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Heartbeat failed: ${(err as Error).message}`);
    }
  }
}
