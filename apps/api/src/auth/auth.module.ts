import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";
import { AuthGuard } from "./auth.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { RateLimitService } from "./rate-limit.service.js";
import { SessionService } from "./session.service.js";

@Module({
  controllers: [AuthController, AccountController],
  providers: [
    AuthService,
    AccountService,
    SessionService,
    RateLimitService,
    // AuthGuard on every route of every module - routes opt out with @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  // invites: read the new user, log them in, and send the "confirm your email" mail
  exports: [AuthService, SessionService, AccountService],
})
export class AuthModule {}
