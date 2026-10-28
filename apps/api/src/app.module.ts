import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";

// The HTTP API. Each feature gets its own module here as the phases add them
// (phase 1: AuthModule, then BrandsModule and staff invites).
@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, HealthModule, AuthModule],
})
export class AppModule {}
