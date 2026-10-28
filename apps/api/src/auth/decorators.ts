import { createParamDecorator, SetMetadata, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { Role } from "../generated/prisma/client.js";
import type { SessionUser } from "./auth.service.js";

export const IS_PUBLIC = "isPublic";
export const ROLES = "roles";

// A route anyone can call without logging in (sign-up, login, health check).
// Every other route needs a login: forgetting a decorator leaves a route closed, never open.
export const Public = () => SetMetadata(IS_PUBLIC, true);

// Only these roles may call the route; others get 403. Without @Roles, any logged-in user may.
//   @Roles(Role.OWNER)                 connect a Facebook page, invite staff
//   @Roles(Role.OWNER, Role.MANAGER)   schedule and publish
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export type RequestWithUser = Request & { user?: SessionUser };

// The logged-in user, put on the request by AuthGuard:  me(@CurrentUser() user: SessionUser)
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): SessionUser => {
  const user = ctx.switchToHttp().getRequest<RequestWithUser>().user;
  // Only reachable on a @Public() route by mistake - fail loudly rather than run with no user.
  if (!user) throw new Error("@CurrentUser() used on a route without a logged-in user (is it @Public?)");
  return user;
});
