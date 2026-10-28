import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "../generated/prisma/client.js";
import { AuthService, notLoggedIn } from "./auth.service.js";
import { IS_PUBLIC, ROLES, type RequestWithUser } from "./decorators.js";
import { readCookie, SESSION_COOKIE } from "./session.js";
import { SessionService } from "./session.service.js";

// Runs before every route in the API (registered as APP_GUARD in AuthModule):
//   1. @Public() route        -> let it through
//   2. no valid login cookie  -> 401 UNAUTHENTICATED
//   3. user no longer exists  -> 401 (deleted users are out at once, even with a valid token)
//   4. @Roles(...) and the user's role isn't listed -> 403 FORBIDDEN
//   5. otherwise              -> req.user = the user, read fresh from the database
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Decorators on the method win over the ones on the controller class.
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const userId = await this.sessions.verify(readCookie(req.headers.cookie, SESSION_COOKIE));
    const user = userId ? await this.auth.findSessionUser(userId) : null;
    if (!user) throw notLoggedIn();

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException({ code: "FORBIDDEN", message: "Your role can't do this" });
    }

    req.user = user;
    return true;
  }
}
