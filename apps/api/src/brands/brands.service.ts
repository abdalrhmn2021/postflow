import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Role } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { SessionUser } from "../auth/auth.service.js";
import type { CreateBrandInput, SetEditorsInput, UpdateBrandInput } from "./brands.schemas.js";

// 404, not 403, for a brand of another agency (or one an editor isn't on):
// the answer must not even tell that the brand exists.
const notFound = () => new NotFoundException({ code: "BRAND_NOT_FOUND", message: "Brand not found" });
const nameTaken = () =>
  new ConflictException({ code: "BRAND_NAME_TAKEN", message: "Your agency already has a brand with this name" });

const brandSelect = {
  id: true,
  name: true,
  language: true,
  voice: true,
  timezone: true,
  createdAt: true,
  members: { select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.BrandSelect;

type BrandRow = Prisma.BrandGetPayload<{ select: typeof brandSelect }>;

// members: [{ user: {...} }] -> editors: [{...}]
function toBrand({ members, ...brand }: BrandRow) {
  return { ...brand, editors: members.map((m) => m.user) };
}

// The brands a user may see. This is the isolation rule of the whole app, in one place:
//   always    -> only their own agency's brands
//   an editor -> and only the brands they are assigned to
export function visibleBrands(user: SessionUser): Prisma.BrandWhereInput {
  return {
    agencyId: user.agencyId,
    ...(user.role === Role.EDITOR && { members: { some: { userId: user.id } } }),
  };
}

function isPrismaError(err: unknown, code: string) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: SessionUser) {
    const brands = await this.prisma.brand.findMany({
      where: visibleBrands(user),
      select: brandSelect,
      orderBy: { name: "asc" },
    });
    return brands.map(toBrand);
  }

  async get(user: SessionUser, id: string) {
    const brand = await this.prisma.brand.findFirst({ where: { id, ...visibleBrands(user) }, select: brandSelect });
    if (!brand) throw notFound();
    return toBrand(brand);
  }

  async create(user: SessionUser, input: CreateBrandInput) {
    try {
      const brand = await this.prisma.brand.create({
        data: { ...input, agencyId: user.agencyId }, // the agency comes from the login, never from the request
        select: brandSelect,
      });
      return toBrand(brand);
    } catch (err) {
      if (isPrismaError(err, "P2002")) throw nameTaken();
      throw err;
    }
  }

  async update(user: SessionUser, id: string, input: UpdateBrandInput) {
    try {
      // where { id, agencyId }: a brand id from another agency matches nothing -> P2025 -> 404.
      const brand = await this.prisma.brand.update({
        where: { id, agencyId: user.agencyId },
        data: input,
        select: brandSelect,
      });
      return toBrand(brand);
    } catch (err) {
      if (isPrismaError(err, "P2025")) throw notFound();
      if (isPrismaError(err, "P2002")) throw nameTaken();
      throw err;
    }
  }

  async remove(user: SessionUser, id: string) {
    const { count } = await this.prisma.brand.deleteMany({ where: { id, agencyId: user.agencyId } });
    if (count === 0) throw notFound();
  }

  // Replaces the brand's editors with exactly these users.
  async setEditors(user: SessionUser, id: string, { userIds }: SetEditorsInput) {
    const brand = await this.prisma.brand.findFirst({ where: { id, agencyId: user.agencyId }, select: { id: true } });
    if (!brand) throw notFound();

    // Only editors of the same agency. Owners and managers see every brand anyway.
    const editors = await this.prisma.user.count({
      where: { id: { in: userIds }, agencyId: user.agencyId, role: Role.EDITOR },
    });
    if (editors !== userIds.length) {
      throw new BadRequestException({
        code: "INVALID_EDITORS",
        message: "Every user must be an editor in your agency",
      });
    }

    // Both steps or neither: a failure half-way must not leave the brand with no editors.
    await this.prisma.$transaction([
      this.prisma.brandMember.deleteMany({ where: { brandId: id } }),
      this.prisma.brandMember.createMany({ data: userIds.map((userId) => ({ userId, brandId: id })) }),
    ]);
    return this.get(user, id);
  }
}
