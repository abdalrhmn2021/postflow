import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Role } from "../generated/prisma/client.js";
import { AuthGuard } from "./auth.guard.js";
import type { AuthService, SessionUser } from "./auth.service.js";
import { Public, Roles, type RequestWithUser } from "./decorators.js";
import type { SessionService } from "./session.service.js";

// Routes as a controller would declare them.
class Routes {
  @Public() open() {}
  anyLoggedIn() {}
  @Roles(Role.OWNER) ownerOnly() {}
  @Roles(Role.OWNER, Role.MANAGER) ownerOrManager() {}
}

const editor: SessionUser = {
  id: "u1",
  agencyId: "a1",
  name: "Editor",
  email: "editor@agency.test",
  role: Role.EDITOR,
  agency: { id: "a1", name: "Agency", slug: "agency", plan: "FREE" },
};

// The guard with a token checker and a user lookup we control.
function setup(user: SessionUser | null = editor) {
  const sessions = { verify: (t: string | null) => Promise.resolve(t === "good-token" ? "u1" : null) };
  const auth = { findSessionUser: () => Promise.resolve(user) };
  const guard = new AuthGuard(new Reflector(), sessions as SessionService, auth as unknown as AuthService);

  const call = (route: keyof Routes, cookie?: string) => {
    const req: RequestWithUser = { headers: { cookie } } as RequestWithUser;
    const ctx = {
      getHandler: () => Routes.prototype[route],
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { req, result: guard.canActivate(ctx) };
  };
  return call;
}

describe("AuthGuard", () => {
  it("lets anyone through a @Public() route", async () => {
    await expect(setup()("open").result).resolves.toBe(true);
  });

  it("refuses a route with no cookie, or a bad one, with 401", async () => {
    await expect(setup()("anyLoggedIn").result).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(setup()("anyLoggedIn", "pf_session=forged").result).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("refuses a valid token whose user was deleted", async () => {
    await expect(setup(null)("anyLoggedIn", "pf_session=good-token").result).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("puts the logged-in user on the request", async () => {
    const { req, result } = setup()("anyLoggedIn", "pf_session=good-token");
    await expect(result).resolves.toBe(true);
    expect(req.user).toEqual(editor);
  });

  it("answers 403 FORBIDDEN when the role isn't allowed", async () => {
    const { result } = setup()("ownerOnly", "pf_session=good-token");
    const err = (await result.catch((e: unknown) => e)) as ForbiddenException;
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets every listed role through", async () => {
    const manager = { ...editor, role: Role.MANAGER };
    await expect(setup(manager)("ownerOrManager", "pf_session=good-token").result).resolves.toBe(true);
    await expect(setup(manager)("ownerOnly", "pf_session=good-token").result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
