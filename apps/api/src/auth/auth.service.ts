import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma, Role } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RESERVED_SLUGS, type LoginInput, type RegisterInput } from "./auth.schemas.js";
import { hashPassword, verifyPassword } from "./password.js";

// Fixed codes the website translates (Arabic / English), like BookFlow's error codes.
const emailTaken = () => new ConflictException({ code: "EMAIL_TAKEN", message: "This email already has an account" });
const slugTaken = () => new ConflictException({ code: "SLUG_TAKEN", message: "This agency link name is taken" });
// One message for "no such email" and "wrong password": a stranger can't use the login form
// to find out which emails have an account.
const invalidCredentials = () =>
  new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Wrong email or password" });
export const notLoggedIn = () => new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Please log in" });

// The columns a signed-in user and their agency are sent to the website with - passwordHash never is.
const sessionSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  agency: { select: { id: true, name: true, slug: true, plan: true } },
} satisfies Prisma.UserSelect;

type SessionUser = Prisma.UserGetPayload<{ select: typeof sessionSelect }>;

// { user, agency } - the same shape for register, login and /me.
function toSession({ agency, ...user }: SessionUser) {
  return { user, agency };
}

// Which unique column a Prisma "unique constraint failed" (P2002) error is about, if any.
export function uniqueViolation(err: unknown): "email" | "slug" | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return null;
  const details = JSON.stringify(err.meta ?? {});
  if (details.includes("email")) return "email";
  if (details.includes("slug")) return "slug";
  return null;
}

// Checked against when the email has no account, so a wrong email takes as long as a wrong password
// (otherwise the response time alone would tell which emails are registered). Made once, on first use.
let dummyHash: Promise<string> | undefined;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  // A new agency and its owner, in one step.
  async register(input: RegisterInput) {
    if (RESERVED_SLUGS.has(input.slug)) throw slugTaken();

    // Checked first so the person gets the right message ...
    const [emailOwner, slugOwner] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
      this.prisma.agency.findUnique({ where: { slug: input.slug }, select: { id: true } }),
    ]);
    if (emailOwner) throw emailTaken();
    if (slugOwner) throw slugTaken();

    const passwordHash = await hashPassword(input.password);

    try {
      // A nested create is one INSERT transaction: if the user can't be saved, the agency isn't either,
      // so there is never an agency without an owner.
      const user = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: Role.OWNER,
          agency: { create: { name: input.agencyName, slug: input.slug } },
        },
        select: sessionSelect,
      });
      return toSession(user);
    } catch (err) {
      // ... and the unique indexes are the real guard: two sign-ups with the same email at the same
      // moment both pass the check above, but only one INSERT succeeds.
      const field = uniqueViolation(err);
      if (field === "email") throw emailTaken();
      if (field === "slug") throw slugTaken();
      throw err;
    }
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { ...sessionSelect, passwordHash: true },
    });
    const ok = await verifyPassword(input.password, user?.passwordHash ?? (await (dummyHash ??= hashPassword("x"))));
    if (!user || !ok) throw invalidCredentials();

    const { passwordHash: _, ...rest } = user;
    return toSession(rest);
  }

  // The signed-in user, freshly read: a deleted user is logged out at once, a changed role applies at once.
  async me(userId: string | null) {
    const user = userId ? await this.prisma.user.findUnique({ where: { id: userId }, select: sessionSelect }) : null;
    if (!user) throw notLoggedIn();
    return toSession(user);
  }
}
