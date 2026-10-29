import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "../generated/prisma/client.js";
import type { Env } from "../config/env.js";
import { AuthService, toSession, uniqueViolation, type SessionUser } from "../auth/auth.service.js";
import { hashPassword } from "../auth/password.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { hashInviteToken, INVITE_DAYS, inviteLink, newInviteToken } from "./invite-token.js";
import type { AcceptInviteInput, CreateInviteInput } from "./invites.schemas.js";

const emailTaken = () => new ConflictException({ code: "EMAIL_TAKEN", message: "This email already has an account" });
const inviteNotFound = () => new NotFoundException({ code: "INVITE_NOT_FOUND", message: "Invite not found" });
// One answer for a wrong, used, cancelled or expired link: the page just says "this link doesn't work".
const inviteInvalid = () =>
  new NotFoundException({ code: "INVITE_INVALID", message: "This invite link is wrong, used or expired" });

// What the owner sees in the list - never tokenHash.
const inviteSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true } },
} satisfies Prisma.InviteSelect;

function expiryFromNow() {
  return new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

@Injectable()
export class InvitesService {
  private readonly webOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.webOrigin = config.get("WEB_ORIGIN", { infer: true });
  }

  // A new invite, or a fresh link for an email already invited (the old link stops working).
  // The link is in this answer only: the database keeps its hash, so it can't be shown again later.
  async create(user: SessionUser, { email, role }: CreateInviteInput) {
    // Emails are unique on the whole site: someone with an account (here or in another agency) can't be invited.
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw emailTaken();

    const token = newInviteToken();
    const data = { role, tokenHash: hashInviteToken(token), expiresAt: expiryFromNow(), invitedById: user.id };
    const invite = await this.prisma.invite.upsert({
      where: { agencyId_email: { agencyId: user.agencyId, email } }, // the agency comes from the login
      create: { ...data, email, agencyId: user.agencyId },
      update: data,
      select: inviteSelect,
    });
    return { ...invite, link: inviteLink(this.webOrigin, token) };
  }

  // Open invites, newest first. An expired one stays in the list (the website marks it) until it is
  // cancelled or sent again.
  list(user: SessionUser) {
    return this.prisma.invite.findMany({
      where: { agencyId: user.agencyId },
      select: inviteSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  async cancel(user: SessionUser, id: string) {
    // where { id, agencyId }: another agency's invite matches nothing -> 404, like brands.
    const { count } = await this.prisma.invite.deleteMany({ where: { id, agencyId: user.agencyId } });
    if (count === 0) throw inviteNotFound();
  }

  // For the invite page before the form: "You're invited to join Centriva as an editor".
  async preview(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      select: { email: true, role: true, expiresAt: true, agency: { select: { name: true, slug: true } } },
    });
    if (!invite || invite.expiresAt <= new Date()) throw inviteInvalid();
    const { expiresAt: _, ...rest } = invite;
    return rest;
  }

  // Makes the account and returns { user, agency } like sign-up; the controller then logs them in.
  async accept({ token, name, password }: AcceptInviteInput) {
    const tokenHash = hashInviteToken(token);
    const found = await this.prisma.invite.findUnique({ where: { tokenHash }, select: { expiresAt: true } });
    if (!found || found.expiresAt <= new Date()) throw inviteInvalid();

    // Slow on purpose (bcrypt), so done before the transaction, not while it holds the invite row.
    const passwordHash = await hashPassword(password);

    try {
      const userId = await this.prisma.$transaction(async (tx) => {
        // Deleting first is the "works once" lock: if the same link is sent twice at the same moment,
        // only one delete finds the row; the other gets P2025 -> INVITE_INVALID.
        const invite = await tx.invite.delete({ where: { tokenHash } });
        if (invite.expiresAt <= new Date()) throw inviteInvalid(); // ran out between the check and now
        const created = await tx.user.create({
          data: { name, email: invite.email, passwordHash, role: invite.role, agencyId: invite.agencyId },
          select: { id: true },
        });
        return created.id;
      });

      const user = await this.auth.findSessionUser(userId);
      if (!user) throw inviteInvalid(); // the agency was deleted in that same moment
      return toSession(user);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") throw inviteInvalid();
      // The email got an account after the invite was made (e.g. signed up its own agency):
      // the transaction is rolled back, so the invite is kept and the owner sees it in the list.
      if (uniqueViolation(err) === "email") throw emailTaken();
      throw err;
    }
  }
}
