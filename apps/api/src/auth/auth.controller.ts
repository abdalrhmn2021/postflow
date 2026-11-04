import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { Env } from "../config/env.js";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "./auth.schemas.js";
import { AuthService, toSession, type SessionUser } from "./auth.service.js";
import { CurrentUser, Public } from "./decorators.js";
import { RateLimitService } from "./rate-limit.service.js";
import { readCookie, SESSION_COOKIE, sessionCookieOptions } from "./session.js";
import { SessionService } from "./session.service.js";

// Every answer that logs someone in has the same body: { user, agency }.
@Controller("auth")
export class AuthController {
  private readonly production: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly limits: RateLimitService,
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
    await this.limits.signup(req.ip ?? "unknown"); // before the database and the slow password hash
    const session = await this.auth.register(body);
    await this.setCookie(res, session.user.id);
    return session;
  }

  // POST /api/auth/login -> 200 { user, agency } + login cookie
  // 400 VALIDATION_ERROR, 401 INVALID_CREDENTIALS, 429 TOO_MANY_ATTEMPTS
  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.limits.login(req.ip ?? "unknown"); // before the database and the slow password check
    const session = await this.auth.login(body);
    await this.setCookie(res, session.user.id);
    return session;
  }

  // POST /api/auth/logout -> 204: this login is closed (its token stops working everywhere, even a
  // copy of the cookie) and the cookie removed. Fine to call when already logged out.
  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.end(readCookie(req.headers.cookie, SESSION_COOKIE));
    this.clearCookie(res);
  }

  // POST /api/auth/logout-all -> 204: every login of this person, on every device, this one too.
  // For a lost phone, or a computer left logged in somewhere.
  @Post("logout-all")
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    await this.sessions.endAll(user.id);
    this.clearCookie(res);
  }

  // GET /api/auth/me -> 200 { user, agency }, 401 UNAUTHENTICATED (from AuthGuard)
  // The website calls this on load to know who is signed in.
  @Get("me")
  me(@CurrentUser() user: SessionUser) {
    return toSession(user);
  }

  private async setCookie(res: Response, userId: string) {
    res.cookie(SESSION_COOKIE, await this.sessions.start(userId), sessionCookieOptions(this.production));
  }

  private clearCookie(res: Response) {
    const { maxAge: _, ...options } = sessionCookieOptions(this.production);
    res.clearCookie(SESSION_COOKIE, options);
  }
}
