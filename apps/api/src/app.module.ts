import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { HealthModule } from "./health/health.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { BrandsModule } from "./brands/brands.module.js";
import { InvitesModule } from "./invites/invites.module.js";
import { StaffModule } from "./staff/staff.module.js";
import { PostsModule } from "./posts/posts.module.js";

// The HTTP API. Each feature gets its own module here as the phases add them
// (phase 1: AuthModule, BrandsModule, InvitesModule, StaffModule; phase 2: PostsModule).
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    BrandsModule,
    InvitesModule,
    StaffModule,
    PostsModule,
  ],
})
export class AppModule {}
