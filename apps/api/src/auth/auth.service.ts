import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma, Role } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RESERVED_SLUGS, type RegisterInput } from "./auth.schemas.js";
import { hashPassword } from "./password.js";

// Fixed codes the website translates (Arabic / English), like BookFlow's error codes.
const emailTaken = () => new ConflictException({ code: "EMAIL_TAKEN", message: "This email already has an account" });
const slugTaken = () => new ConflictException({ code: "SLUG_TAKEN", message: "This agency link name is taken" });

// Which unique column a Prisma "unique constraint failed" (P2002) error is about, if any.
export function uniqueViolation(err: unknown): "email" | "slug" | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return null;
  const details = JSON.stringify(err.meta ?? {});
  if (details.includes("email")) return "email";
  if (details.includes("slug")) return "slug";
  return null;
}

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
      const agency = await this.prisma.agency.create({
        data: {
          name: input.agencyName,
          slug: input.slug,
          users: {
            create: { name: input.name, email: input.email, passwordHash, role: Role.OWNER },
          },
        },
        // Only these columns leave the database - passwordHash never does.
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          users: { select: { id: true, name: true, email: true, role: true } },
        },
      });
      const { users, ...agencyFields } = agency;
      return { agency: agencyFields, user: users[0] };
    } catch (err) {
      // ... and the unique indexes are the real guard: two sign-ups with the same email at the same
      // moment both pass the check above, but only one INSERT succeeds.
      const field = uniqueViolation(err);
      if (field === "email") throw emailTaken();
      if (field === "slug") throw slugTaken();
      throw err;
    }
  }
}
