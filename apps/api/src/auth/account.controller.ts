import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AccountService } from "./account.service.js";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  sendVerificationSchema,
  verifyEmailSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type SendVerificationInput,
  type VerifyEmailInput,
} from "./auth.schemas.js";
import type { SessionUser } from "./auth.service.js";
import { CurrentSessionId, CurrentUser, Public } from "./decorators.js";

// The person's own account: confirming the email, forgetting and changing the password.
@Controller("auth")
export class AccountController {
  constructor(private readonly account: AccountService) {}

  // POST /api/auth/verify-email/send { lang } -> 204: the "confirm your email" mail again
  // 429 TOO_MANY_EMAILS. Already confirmed: 204, nothing sent.
  @Post("verify-email/send")
  @HttpCode(204)
  resendVerification(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(sendVerificationSchema)) { lang }: SendVerificationInput,
  ) {
    return this.account.resendVerification(user, lang);
  }

  // POST /api/auth/verify-email { token } -> 204 | 404 VERIFY_LINK_INVALID (no login needed)
  @Public()
  @Post("verify-email")
  @HttpCode(204)
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) { token }: VerifyEmailInput) {
    return this.account.verifyEmail(token);
  }

  // POST /api/auth/forgot-password { email, lang } -> 204, always (whether the email has an account
  // or not) | 429 TOO_MANY_EMAILS
  @Public()
  @Post("forgot-password")
  @HttpCode(204)
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) { email, lang }: ForgotPasswordInput,
    @Req() req: Request,
  ) {
    return this.account.forgotPassword(req.ip ?? "unknown", email, lang);
  }

  // POST /api/auth/reset-password { token, password } -> 204, every login of the person ended
  // | 404 RESET_LINK_INVALID | 400 VALIDATION_ERROR
  @Public()
  @Post("reset-password")
  @HttpCode(204)
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) { token, password }: ResetPasswordInput) {
    return this.account.resetPassword(token, password);
  }

  // POST /api/auth/change-password { currentPassword, newPassword } -> 204, the other logins ended
  // | 400 WRONG_PASSWORD / VALIDATION_ERROR | 429 TOO_MANY_ATTEMPTS
  @Post("change-password")
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: SessionUser,
    @CurrentSessionId() sessionId: string,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.account.changePassword(user, sessionId, body.currentPassword, body.newPassword);
  }
}
