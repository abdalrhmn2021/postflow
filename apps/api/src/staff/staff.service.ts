import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdateStaffInput } from "./staff.schemas.js";

// 404 for someone in another agency, like brands: the answer doesn't tell that the person exists.
const notFound = () => new NotFoundException({ code: "STAFF_NOT_FOUND", message: "Staff member not found" });
// The owner can't be changed or removed - by anyone, themselves included - so an agency always has an owner.
const cannotChangeOwner = () =>
  new BadRequestException({ code: "CANNOT_CHANGE_OWNER", message: "The agency owner can't be changed or removed" });

// What the staff list shows - never passwordHash.
const staffSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  brands: { select: { brand: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

// brands: [{ brand: {...} }] -> brands: [{...}]
function toStaff({ brands, ...user }: StaffRow) {
  return { ...user, brands: brands.map((b) => b.brand) };
}

// Owner first, then managers, then editors (the enum's order), each by when they joined.
const roleOrder: Record<Role, number> = { OWNER: 0, MANAGER: 1, EDITOR: 2 };

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: SessionUser) {
    const staff = await this.prisma.user.findMany({
      where: { agencyId: user.agencyId },
      select: staffSelect,
      orderBy: { createdAt: "asc" },
    });
    return staff.map(toStaff).sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
  }

  // A staff member of the user's agency who isn't the owner, or the right error.
  private async findChangeable(user: SessionUser, id: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, agencyId: user.agencyId }, // another agency's user matches nothing -> 404
      select: { id: true, role: true },
    });
    if (!target) throw notFound();
    if (target.role === Role.OWNER) throw cannotChangeOwner();
    return target;
  }

  async updateRole(user: SessionUser, id: string, { role }: UpdateStaffInput) {
    const target = await this.findChangeable(user, id);

    if (target.role !== role) {
      // A new role starts with no brands: a manager sees every brand anyway, and an editor who used to be
      // a manager is given their brands again by the owner. Both steps or neither.
      await this.prisma.$transaction([
        this.prisma.brandMember.deleteMany({ where: { userId: id } }),
        this.prisma.user.update({ where: { id }, data: { role } }),
      ]);
    }
    // The new role applies at once: AuthGuard reads the role from the database on every request.
    const updated = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: staffSelect });
    return toStaff(updated);
  }

  async remove(user: SessionUser, id: string) {
    await this.findChangeable(user, id);
    // Cascade removes their brand assignments; invites they sent keep existing (invitedBy -> null).
    // Their login cookie stops working on the next request, because AuthGuard no longer finds the user.
    // role: { not: OWNER } again in the delete itself, so nothing changes if the row changed in between.
    const { count } = await this.prisma.user.deleteMany({
      where: { id, agencyId: user.agencyId, role: { not: Role.OWNER } },
    });
    if (count === 0) throw notFound();
  }
}
