import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EmailTokenPurpose } from "../generated/prisma/client.js";
import type { Env } from "../config/env.js";
import { Mailer } from "../mail/mailer.js";
import { resetPasswordMail, verifyEmailMail, type Lang } from "../mail/templates.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { SessionUser } from "./auth.service.js";
import { hashPassword, verifyPassword } from "./password.js";
import { RateLimitService } from "./rate-limit.service.js";

export const VERIFY_HOURS = 24;
export const RESET_HOURS = 1;

// Same idea as invite links: 32 random bytes in the link, only their SHA-256 in the database.
const newToken = () => randomBytes(32).toString("base64url");
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// One answer for a wrong, used, replaced or expired link: the page says "ask for a new one".
const resetLinkInvalid = () =>
  new NotFoundException({ code: "RESET_LINK_INVALID", message: "This link is wrong, used or expired" });
const verifyLinkInvalid = () =>
  new NotFoundException({ code: "VERIFY_LINK_INVALID", message: "This link is wrong, used or expired" });
const wrongPassword = () =>
  new BadRequestException({ code: "WRONG_PASSWORD", message: "The current password is wrong" });

// The person's own account: confirming the email, forgetting and changing the password.
//
// Both kinds of email link work the same way: a secret in the link, its hash in EmailToken, one use,
// a time limit, and only the newest link of a kind works (asking again replaces the old one).
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private readonly site: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
    private readonly limits: RateLimitService,
    config: ConfigService<Env, true>,
  ) {
    this.site = config.get("WEB_ORIGIN", { infer: true }).split(",")[0]!.trim().replace(/\/+$/, "");
  }

  // ---- Confirming the email ---------------------------------------------------------------------

  // The "confirm your email" mail, after sign-up (in the background: a slow or failing email service
  // never fails the sign-up - they can ask again from the dashboard).
  sendVerificationLater(user: { id: string; name: string; email: string }, lang: Lang) {
    void this.sendVerification(user, lang).catch((err: unknown) =>
      this.logger.warn(`Confirmation email to user ${user.id} not sent: ${(err as Error).message}`),
    );
  }

  // POST /auth/verify-email/send: "send it again" from the dashboard. Already confirmed: nothing to do.
  async resendVerification(user: SessionUser, lang: Lang) {
    if (user.emailVerifiedAt) return;
    await this.limits.verifyEmail(user.id);
    await this.sendVerification(user, lang); // waited for: the page says "sent" only once it's sent
  }

  private async sendVerification(user: { id: string; name: string; email: string }, lang: Lang) {
    if (!(await this.limits.emailTo(user.email))) return;
    const token = await this.newLink(user.id, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_HOURS);
    await this.mailer.send(verifyEmailMail(user, lang, `${this.site}/${lang}/verify-email/${token}`));
  }

  // POST /auth/verify-email { token }: the link was opened. Works without a login (another browser,
  // the phone's mail app). Opening it again after it worked: the link is gone -> VERIFY_LINK_INVALID,
  // and the page says so - the email is confirmed anyway.
  async verifyEmail(token: string) {
    const link = await this.useLink(token, EmailTokenPurpose.VERIFY_EMAIL);
    if (!link) throw verifyLinkInvalid();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: link.userId }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailToken.deleteMany({ where: { userId: link.userId, purpose: EmailTokenPurpose.VERIFY_EMAIL } }),
    ]);
  }

  // ---- Forgot password --------------------------------------------------------------------------

  // POST /auth/forgot-password { email }: always the same quick answer (204), whether the email has an
  // account or not - so the form can't be used to find out who uses PostFlow. That's why the work
  // (a database lookup, the email) runs after the answer: its time doesn't show either.
  async forgotPassword(ip: string, email: string, lang: Lang) {
    await this.limits.forgotPassword(ip); // 429 for this visitor - it says nothing about the email
    void this.sendReset(email, lang).catch((err: unknown) =>
      this.logger.warn(`Password reset email not sent: ${(err as Error).message}`),
    );
  }

  private async sendReset(email: string, lang: Lang) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
    if (!user || !(await this.limits.emailTo(user.email))) return;
    const token = await this.newLink(user.id, EmailTokenPurpose.RESET_PASSWORD, RESET_HOURS);
    await this.mailer.send(resetPasswordMail(user, lang, `${this.site}/${lang}/reset-password/${token}`));
  }

  // POST /auth/reset-password { token, password }: the new password, and every login of the person ends
  // (whoever knew the old password is out). Having the link also proves the email is theirs.
  async resetPassword(token: string, password: string) {
    const passwordHash = await hashPassword(password); // before the link is used: a crash here keeps it
    const link = await this.useLink(token, EmailTokenPurpose.RESET_PASSWORD);
    if (!link) throw resetLinkInvalid();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: link.userId },
      select: { emailVerifiedAt: true },
    });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: link.userId },
        data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      }),
      this.prisma.emailToken.deleteMany({ where: { userId: link.userId, purpose: EmailTokenPurpose.RESET_PASSWORD } }),
      this.prisma.session.deleteMany({ where: { userId: link.userId } }),
    ]);
  }

  // ---- Changing the password (logged in) --------------------------------------------------------

  // POST /auth/change-password { currentPassword, newPassword }: the current one first (someone at an
  // unlocked computer can't change it). This login stays; every other one ends.
  async changePassword(user: SessionUser, sessionId: string, current: string, next: string) {
    await this.limits.passwordCheck(user.id);
    const { passwordHash } = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!(await verifyPassword(current, passwordHash))) throw wrongPassword();

    const newHash = await hashPassword(next);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } }),
      this.prisma.session.deleteMany({ where: { userId: user.id, id: { not: sessionId } } }),
      // A "forgot password" link sent before is for the old password: it stops working too.
      this.prisma.emailToken.deleteMany({ where: { userId: user.id, purpose: EmailTokenPurpose.RESET_PASSWORD } }),
    ]);
  }

  // ---- Links ------------------------------------------------------------------------------------

  // A new link of this kind for the user; the older ones of the same kind stop working.
  private async newLink(userId: string, purpose: EmailTokenPurpose, hours: number): Promise<string> {
    const token = newToken();
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.emailToken.deleteMany({ where: { userId, purpose } }),
      this.prisma.emailToken.create({ data: { userId, purpose, tokenHash: hash(token), expiresAt } }),
    ]);
    return token;
  }

  // Uses a link: deletes it and says whose it was - or null when it's wrong, of the other kind or expired.
  // The delete is the "works once" lock: the same link sent twice at the same moment, only one finds it.
  private async useLink(token: string, purpose: EmailTokenPurpose): Promise<{ userId: string } | null> {
    const tokenHash = hash(token);
    const found = await this.prisma.emailToken.findUnique({ where: { tokenHash } });
    if (!found || found.purpose !== purpose) return null;
    const { count } = await this.prisma.emailToken.deleteMany({ where: { id: found.id } });
    if (count === 0 || found.expiresAt <= new Date()) return null;
    return { userId: found.userId };
  }
}
