import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { InvitesController } from "./invites.controller.js";
import { InvitesService } from "./invites.service.js";

@Module({
  imports: [AuthModule], // AuthService (to read the new user) and SessionService (to log them in)
  controllers: [InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}
