import { createHash, randomBytes } from "node:crypto";
import { BadGatewayException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailTokenPurpose, Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.js";
import { Mailer, type EmailMessage } from "../mail/mailer.js";
import { resetPasswordMessage, verifyEmailMessage, type Lang } from "../mail/templates.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { sessionSelect, type SessionUser } from "./auth.service.js";
import { hashPassword } from "./password.js";

const HOUR_MS = 60 * 60 * 1000;
export const VERIFY_HOURS = 24;
export const RESET_HOURS = 1;

// Same idea as invite and review links: 32 random bytes in the link, only their SHA-256 in the database.
const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// One answer for a wrong, used or expired link: the page just says "this link doesn't work".
const resetInvalid = () =>
  new NotFoundException({ code: "RESET_LINK_INVALID", message: "This link is wrong, used or expired" });
const verifyInvalid = () =>
  new NotFoundException({ code: "VERIFY_LINK_INVALID", message: "This link is wrong or expired" });
const alreadyVerified = () =>
  new ConflictException({ code: "ALREADY_VERIFIED", message: "This email is already confirmed" });
const emailFailed = () =>
  new BadGatewayException({ code: "EMAIL_FAILED", message: "The email couldn't be sent - try again in a while" });

type Recipient = { id: string; email: string; name: string };

// The emailed links: confirm an email, reset a forgotten password.
//   confirm: sent after sign-up (and on "send it again"); works for 24 hours, as often as it's opened.
//   reset:   sent on "forgot password"; works for 1 hour, once. Using it sets the new password,
//            logs the person out everywhere else (sessionVersion + 1), and counts as confirming the email.
// A new link of a kind replaces the person's older one of that kind.
@Injectable()
export class EmailAuthService {
  private readonly logger = new Logger(EmailAuthService.name);
  private readonly site: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    config: ConfigService<Env, true>,
  ) {
    // The links open the website; WEB_ORIGIN may list several sites, the first one is used.
    this.site = config.get("WEB_ORIGIN", { infer: true }).split(",")[0].trim().replace(/\/+$/, "");
  }

  // false when the email couldn't be handed to Brevo (logged).
  async sendVerification(user: Recipient, lang: Lang): Promise<boolean> {
    const token = await this.issue(user.id, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_HOURS);
    return this.deliver(verifyEmailMessage(lang, user, `${this.site}/${lang}/verify-email/${token}`));
  }

  // "Send the confirmation email again", from the dashboard.
  async resendVerification(user: SessionUser, lang: Lang): Promise<void> {
    if (user.emailVerifiedAt) throw alreadyVerified();
    if (!(await this.sendVerification(user, lang))) throw emailFailed();
  }

  async verifyEmail(token: string): Promise<void> {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.purpose !== EmailTokenPurpose.VERIFY_EMAIL || row.expiresAt <= new Date()) {
      throw verifyInvalid();
    }
    // Only if not confirmed yet: opening the link again keeps the first date.
    await this.prisma.user.updateMany({
      where: { id: row.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  // Nothing tells the caller whether the email has an account: the controller answers 204 either way,
  // without waiting for this.
  async forgotPassword(email: string, lang: Lang): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
    if (!user) return;
    const token = await this.issue(user.id, EmailTokenPurpose.RESET_PASSWORD, RESET_HOURS);
    await this.deliver(resetPasswordMessage(lang, user, `${this.site}/${lang}/reset-password/${token}`));
  }

  // For the "choose a new password" page before the form: whose password it is.
  async checkReset(token: string): Promise<{ email: string }> {
    const row = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { purpose: true, expiresAt: true, user: { select: { email: true } } },
    });
    if (!row || row.purpose !== EmailTokenPurpose.RESET_PASSWORD || row.expiresAt <= new Date()) {
      throw resetInvalid();
    }
    return { email: row.user.email };
  }

  // Sets the new password and returns the user, with the new sessionVersion, for the controller to log in.
  async resetPassword(token: string, password: string): Promise<SessionUser> {
    const tokenHash = hashToken(token);
    await this.checkReset(token); // a wrong link answers before the slow hashing
    const passwordHash = await hashPassword(password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Deleting first is the "works once" lock: the same link sent twice at the same moment -
        // only one delete finds the row; the other gets P2025 -> RESET_LINK_INVALID.
        const row = await tx.emailToken.delete({ where: { tokenHash } });
        if (row.purpose !== EmailTokenPurpose.RESET_PASSWORD || row.expiresAt <= new Date()) throw resetInvalid();
        await tx.emailToken.deleteMany({ where: { userId: row.userId, purpose: EmailTokenPurpose.RESET_PASSWORD } });
        // The link came to their inbox: that confirms the email too.
        await tx.user.updateMany({
          where: { id: row.userId, emailVerifiedAt: null },
          data: { emailVerifiedAt: new Date() },
        });
        return tx.user.update({
          where: { id: row.userId },
          // + 1: every device logged in with the old password is logged out.
          data: { passwordHash, sessionVersion: { increment: 1 } },
          select: sessionSelect,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") throw resetInvalid();
      throw err;
    }
  }

  // A new link of this kind for the user; their older ones of the same kind stop working.
  private async issue(userId: string, purpose: EmailTokenPurpose, hours: number): Promise<string> {
    const token = newToken();
    await this.prisma.$transaction([
      this.prisma.emailToken.deleteMany({ where: { userId, purpose } }),
      this.prisma.emailToken.create({
        data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + hours * HOUR_MS) },
      }),
    ]);
    return token;
  }

  private async deliver(message: EmailMessage): Promise<boolean> {
    try {
      await this.mailer.send(message);
      return true;
    } catch (err) {
      this.logger.error(`"${message.subject}" wasn't sent: ${(err as Error).message}`);
      return false;
    }
  }
}
