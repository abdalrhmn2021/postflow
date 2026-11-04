import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jwtVerify, SignJWT } from "jose";
import type { Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SESSION_DAYS } from "./session.js";

// What a valid login token says: which login (a Session row) and whose.
export type SessionToken = { sessionId: string; userId: string };

// Logins. Each one is a Session row in the database plus a token in the cookie (a JWT signed with
// JWT_SECRET) that carries the row's id (jti) and the user's id (sub).
//
// The signature proves WE made the token; the row proves the login is still open. AuthGuard needs
// both, so logging out (deleting the row) ends the login at once, even for a copied cookie.
// Role and agency are never in the token: AuthGuard reads them fresh, so a change applies at once.
@Injectable()
export class SessionService {
  private readonly key: Uint8Array;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.key = new TextEncoder().encode(config.get("JWT_SECRET", { infer: true }));
  }

  // A new login for this user: the row, then the token for the cookie.
  async start(userId: string): Promise<string> {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const session = await this.prisma.session.create({ data: { userId, expiresAt }, select: { id: true } });
    return new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setJti(session.id)
      .setIssuedAt()
      .setExpirationTime(expiresAt)
      .sign(this.key);
  }

  // What's inside a token we signed and that hasn't run out; null for a missing, expired or forged one,
  // and for a token from before sessions were stored (it has no jti: that login is simply over).
  // Only checks the signature - AuthGuard checks the row (AuthService.findSessionUser).
  async verify(token: string | null): Promise<SessionToken | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      return payload.sub && payload.jti ? { sessionId: payload.jti, userId: payload.sub } : null;
    } catch {
      return null;
    }
  }

  // Log out: this login only. Nothing to do for a missing or bad token.
  async end(token: string | null): Promise<void> {
    const session = await this.verify(token);
    if (session) await this.prisma.session.deleteMany({ where: { id: session.sessionId } });
  }

  // Log out everywhere: every login of this user, on every device (this one too).
  async endAll(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }
}
