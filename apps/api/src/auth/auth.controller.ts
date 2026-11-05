import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { Env } from "../config/env.js";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "./auth.schemas.js";
import { AuthService, toSession, type SessionUser } from "./auth.service.js";
import { AuthLimits } from "./auth-limits.service.js";
import { CurrentUser, Public } from "./decorators.js";
import { SESSION_COOKIE, sessionCookieOptions } from "./session.js";
import { SessionService } from "./session.service.js";

// Every answer that logs someone in has the same body: { user, agency }.
@Controller("auth")
export class AuthController {
  private readonly production: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly limits: AuthLimits,
    config: ConfigService<Env, true>,
  ) {
    this.production = config.get("NODE_ENV", { infer: true }) === "production";
  }

  // POST /api/auth/register -> 201 { user, agency } + login cookie (signed in straight away)
  // 400 VALIDATION_ERROR, 409 EMAIL_TAKEN / SLUG_TAKEN, 429 TOO_MANY_SIGNUPS
  @Public()
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.signup(req.ip ?? "unknown");
    const user = await this.auth.register(body);
    await this.setCookie(res, user);
    return toSession(user);
  }

  // POST /api/auth/login -> 200 { user, agency } + login cookie
  // 400 VALIDATION_ERROR, 401 INVALID_CREDENTIALS, 429 TOO_MANY_ATTEMPTS / TOO_MANY_ACCOUNT_ATTEMPTS
  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.login(req.ip ?? "unknown", body.email); // before the database and the slow password check
    const user = await this.auth.login(body);
    await this.limits.loginSucceeded(body.email);
    await this.setCookie(res, user);
    return toSession(user);
  }

  // POST /api/auth/logout -> 204, cookie removed. Fine to call when already logged out.
  // This device only: the person's other devices stay logged in (see logout-all).
  @Public()
  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    this.clearCookie(res);
  }

  // POST /api/auth/logout-all -> 204: every login of this user ends, on every device, this one too.
  // For a phone that was lost, a shared computer, a password someone else may know.
  @Post("logout-all")
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.endAllSessions(user.id);
    this.clearCookie(res);
  }

  // GET /api/auth/me -> 200 { user, agency }, 401 UNAUTHENTICATED (from AuthGuard)
  // The website calls this on load to know who is signed in.
  @Get("me")
  me(@CurrentUser() user: SessionUser) {
    return toSession(user);
  }

  private async setCookie(res: Response, user: SessionUser) {
    res.cookie(SESSION_COOKIE, await this.sessions.sign(user), sessionCookieOptions(this.production));
  }

  private clearCookie(res: Response) {
    const { maxAge: _, ...options } = sessionCookieOptions(this.production);
    res.clearCookie(SESSION_COOKIE, options);
  }
}
