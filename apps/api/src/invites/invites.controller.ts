import { Body, Controller, Delete, Get, HttpCode, Logger, Param, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { Role } from "../generated/prisma/client.js";
import type { Env } from "../config/env.js";
import { AuthLimits } from "../auth/auth-limits.service.js";
import { toSession, type SessionUser } from "../auth/auth.service.js";
import { EmailAuthService } from "../auth/email-auth.service.js";
import { CurrentUser, Public, Roles } from "../auth/decorators.js";
import { SESSION_COOKIE, sessionCookieOptions } from "../auth/session.js";
import { SessionService } from "../auth/session.service.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  acceptInviteSchema,
  createInviteSchema,
  type AcceptInviteInput,
  type CreateInviteInput,
} from "./invites.schemas.js";
import { InvitesService } from "./invites.service.js";

// Staff invites. Making, listing and cancelling them is for the owner only (the plan's roles table);
// opening and accepting a link is public - the person has no account yet.
@Controller("invites")
export class InvitesController {
  private readonly logger = new Logger(InvitesController.name);
  private readonly production: boolean;

  constructor(
    private readonly invites: InvitesService,
    private readonly sessions: SessionService,
    private readonly limits: AuthLimits,
    private readonly emailAuth: EmailAuthService,
    config: ConfigService<Env, true>,
  ) {
    this.production = config.get("NODE_ENV", { infer: true }) === "production";
  }

  // POST /api/invites { email, role } -> 201 { ..., link } | 400 VALIDATION_ERROR | 409 EMAIL_TAKEN
  @Post()
  @Roles(Role.OWNER)
  create(@CurrentUser() user: SessionUser, @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput) {
    return this.invites.create(user, body);
  }

  // GET /api/invites -> the agency's open invites (no links: only their hashes are stored)
  @Get()
  @Roles(Role.OWNER)
  list(@CurrentUser() user: SessionUser) {
    return this.invites.list(user);
  }

  // DELETE /api/invites/:id -> 204 | 404 INVITE_NOT_FOUND
  @Delete(":id")
  @Roles(Role.OWNER)
  @HttpCode(204)
  cancel(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.invites.cancel(user, id);
  }

  // GET /api/invites/accept/:token -> { email, role, agency: { name, slug } } | 404 INVITE_INVALID
  @Public()
  @Get("accept/:token")
  preview(@Param("token") token: string) {
    return this.invites.preview(token);
  }

  // POST /api/invites/accept { token, name, password } -> 201 { user, agency } + login cookie
  // 400 VALIDATION_ERROR | 404 INVITE_INVALID | 409 EMAIL_TAKEN | 429 TOO_MANY_SIGNUPS
  @Public()
  @Post("accept")
  async accept(
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.signup(req.ip ?? "unknown"); // a new account, like a sign-up
    const user = await this.invites.accept(body);
    res.cookie(SESSION_COOKIE, await this.sessions.sign(user), sessionCookieOptions(this.production));
    // The invite came by WhatsApp or the like, not by email: the address still needs confirming.
    void this.emailAuth.sendVerification(user, body.lang).catch((err: Error) => this.logger.error(err.message));
    return toSession(user);
  }
}
