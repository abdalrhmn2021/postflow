import { Body, Controller, Delete, Get, HttpCode, Param, Patch } from "@nestjs/common";
import { Role } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { updateStaffSchema, type UpdateStaffInput } from "./staff.schemas.js";
import { StaffService } from "./staff.service.js";

// The agency's people. Managers may see the team; changing it is for the owner only (the plan's roles table).
// New people join through invites (/api/invites).
@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  // GET /api/staff -> everyone in the agency, with the brands each editor is on
  @Get()
  @Roles(Role.OWNER, Role.MANAGER)
  list(@CurrentUser() user: SessionUser) {
    return this.staff.list(user);
  }

  // PATCH /api/staff/:id { role } -> the staff member | 400 CANNOT_CHANGE_OWNER / VALIDATION_ERROR | 404 STAFF_NOT_FOUND
  @Patch(":id")
  @Roles(Role.OWNER)
  update(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStaffSchema)) body: UpdateStaffInput,
  ) {
    return this.staff.updateRole(user, id, body);
  }

  // DELETE /api/staff/:id -> 204 | 400 CANNOT_CHANGE_OWNER | 404 STAFF_NOT_FOUND
  @Delete(":id")
  @Roles(Role.OWNER)
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.staff.remove(user, id);
  }
}
