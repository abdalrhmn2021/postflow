import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from "@nestjs/common";
import { Role } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  createBrandSchema,
  setEditorsSchema,
  updateBrandSchema,
  type CreateBrandInput,
  type SetEditorsInput,
  type UpdateBrandInput,
} from "./brands.schemas.js";
import { BrandsService } from "./brands.service.js";

// An agency's clients. Every route needs a login (AuthGuard); changing brands is for the owner only,
// as in the plan's roles table. A brand outside the user's reach is always 404 BRAND_NOT_FOUND.
@Controller("brands")
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  // GET /api/brands -> owner and managers: every brand; editors: their brands only
  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.brands.list(user);
  }

  // GET /api/brands/:id
  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.brands.get(user, id);
  }

  // POST /api/brands -> 201 | 400 VALIDATION_ERROR | 409 BRAND_NAME_TAKEN
  @Post()
  @Roles(Role.OWNER)
  create(@CurrentUser() user: SessionUser, @Body(new ZodValidationPipe(createBrandSchema)) body: CreateBrandInput) {
    return this.brands.create(user, body);
  }

  // PATCH /api/brands/:id -> only the fields sent change
  @Patch(":id")
  @Roles(Role.OWNER)
  update(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBrandSchema)) body: UpdateBrandInput,
  ) {
    return this.brands.update(user, id, body);
  }

  // DELETE /api/brands/:id -> 204
  @Delete(":id")
  @Roles(Role.OWNER)
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.brands.remove(user, id);
  }

  // PUT /api/brands/:id/editors { userIds: [...] } -> the brand with its new editors | 400 INVALID_EDITORS
  @Put(":id/editors")
  @Roles(Role.OWNER)
  setEditors(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setEditorsSchema)) body: SetEditorsInput,
  ) {
    return this.brands.setEditors(user, id, body);
  }
}
