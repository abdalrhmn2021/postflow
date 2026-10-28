import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "./auth.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { LoginLimitService } from "./login-limit.service.js";
import { SessionService } from "./session.service.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionService,
    LoginLimitService,
    // AuthGuard on every route of every module - routes opt out with @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
