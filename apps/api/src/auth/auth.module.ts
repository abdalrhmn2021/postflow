import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { LoginLimitService } from "./login-limit.service.js";
import { SessionService } from "./session.service.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, LoginLimitService],
  exports: [SessionService, AuthService], // the login guard (next step) uses them
})
export class AuthModule {}
