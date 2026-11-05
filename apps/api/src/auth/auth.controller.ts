import { Body, Controller, Get, HttpCode, Logger, Param, Post, Req, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { Env } from "../config/env.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResendVerificationInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from "./auth.schemas.js";
import { AuthService, toSession, type SessionUser } from "./auth.service.js";
import { AuthLimits } from "./auth-limits.service.js";
import { CurrentUser, Public } from "./decorators.js";
import { EmailAuthService } from "./email-auth.service.js";
import { SESSION_COOKIE, sessionCookieOptions } from "./session.js";
import { SessionService } from "./session.service.js";

// Every answer that logs someone in has the same body: { user, agency }.
@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly production: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly limits: AuthLimits,
    private readonly emailAuth: EmailAuthService,
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
    // Not waited for: signing up doesn't wait on Brevo, and a failed email only means the dashboard's
    // "send it again" is needed (sendVerification logs it).
    void this.emailAuth.sendVerification(user, body.lang).catch((err: Error) => this.logger.error(err.message));
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

  // POST /api/auth/forgot-password { email, lang } -> 204, always - with or without an account, so the
  // form can't be used to find out who is registered. The email (if any) goes out after the answer,
  // so the time it takes doesn't tell either. 429 TOO_MANY_EMAILS.
  @Public()
  @Post("forgot-password")
  @HttpCode(204)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    await this.limits.email(req.ip ?? "unknown", body.email);
    void this.emailAuth.forgotPassword(body.email, body.lang).catch((err: Error) => this.logger.error(err.message));
  }

  // GET /api/auth/reset-password/:token -> { email } | 404 RESET_LINK_INVALID
  @Public()
  @Get("reset-password/:token")
  checkReset(@Param("token") token: string) {
    return this.emailAuth.checkReset(token);
  }

  // POST /api/auth/reset-password { token, password } -> 200 { user, agency } + login cookie:
  // the new password is set, every other device is logged out, and this one is logged in.
  // 400 VALIDATION_ERROR | 404 RESET_LINK_INVALID
  @Public()
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.emailAuth.resetPassword(body.token, body.password);
    await this.limits.loginSucceeded(user.email); // a fresh start for the login limit
    await this.setCookie(res, user);
    return toSession(user);
  }

  // POST /api/auth/verify-email { token } -> 200 { emailVerified: true } | 404 VERIFY_LINK_INVALID
  // Public: the link may be opened on a phone where the person isn't logged in.
  @Public()
  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    await this.emailAuth.verifyEmail(body.token);
    return { emailVerified: true };
  }

  // POST /api/auth/resend-verification { lang } -> 204 | 409 ALREADY_VERIFIED | 429 TOO_MANY_EMAILS
  //   | 502 EMAIL_FAILED
  @Post("resend-verification")
  @HttpCode(204)
  async resendVerification(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(resendVerificationSchema)) body: ResendVerificationInput,
    @Req() req: Request,
  ) {
    await this.limits.email(req.ip ?? "unknown", user.email);
    await this.emailAuth.resendVerification(user, body.lang);
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
