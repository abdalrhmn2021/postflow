import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { RateLimiter } from "../common/rate-limiter.js";
import { AUTH_LIMITS, AuthLimits, DEFAULT_AUTH_LIMITS } from "./auth-limits.service.js";
import { SessionService } from "./session.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    RateLimiter,
    AuthLimits,
    { provide: AUTH_LIMITS, useValue: DEFAULT_AUTH_LIMITS },
    // AuthGuard on every route of every module - routes opt out with @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  // invites: read the new user, log them in, and count the new account like a sign-up
  exports: [AuthService, SessionService, AuthLimits],
})
export class AuthModule {}
