import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config/config.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RedisModule } from "../redis/redis.module.js";
import { HeartbeatService } from "./heartbeat.service.js";

// The background worker: same code, same database, but no HTTP server.
// Phase 4 adds the publish queue processor here.
@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule],
  providers: [HeartbeatService],
})
export class WorkerModule {}
