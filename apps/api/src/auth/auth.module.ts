import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { RateLimitService } from "./rate-limit.service.js";
import { SessionService } from "./session.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    RateLimitService,
    // AuthGuard on every route of every module - routes opt out with @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, SessionService], // invites: read the new user and log them in
})
export class AuthModule {}
