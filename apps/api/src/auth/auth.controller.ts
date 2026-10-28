import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { Env } from "../config/env.js";
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from "./auth.schemas.js";
import { AuthService } from "./auth.service.js";
import { LoginLimitService } from "./login-limit.service.js";
import { readCookie, SESSION_COOKIE, sessionCookieOptions } from "./session.js";
import { SessionService } from "./session.service.js";

// Every answer that logs someone in has the same body: { user, agency }.
@Controller("auth")
export class AuthController {
  private readonly production: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly loginLimit: LoginLimitService,
    config: ConfigService<Env, true>,
  ) {
    this.production = config.get("NODE_ENV", { infer: true }) === "production";
  }

  // POST /api/auth/register -> 201 { user, agency } + login cookie (signed in straight away)
  // 400 VALIDATION_ERROR, 409 EMAIL_TAKEN / SLUG_TAKEN
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.register(body);
    await this.setCookie(res, session.user.id);
    return session;
  }

  // POST /api/auth/login -> 200 { user, agency } + login cookie
  // 400 VALIDATION_ERROR, 401 INVALID_CREDENTIALS, 429 TOO_MANY_ATTEMPTS
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.loginLimit.hit(req.ip ?? "unknown"); // before the database and the slow password check
    const session = await this.auth.login(body);
    await this.setCookie(res, session.user.id);
    return session;
  }

  // POST /api/auth/logout -> 204, cookie removed. Fine to call when already logged out.
  @Post("logout")
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    const { maxAge: _, ...options } = sessionCookieOptions(this.production);
    res.clearCookie(SESSION_COOKIE, options);
  }

  // GET /api/auth/me -> 200 { user, agency }, 401 UNAUTHENTICATED
  // The website calls this on load to know who is signed in.
  @Get("me")
  async me(@Req() req: Request) {
    const userId = await this.sessions.verify(readCookie(req.headers.cookie, SESSION_COOKIE));
    return this.auth.me(userId);
  }

  private async setCookie(res: Response, userId: string) {
    res.cookie(SESSION_COOKIE, await this.sessions.sign(userId), sessionCookieOptions(this.production));
  }
}
