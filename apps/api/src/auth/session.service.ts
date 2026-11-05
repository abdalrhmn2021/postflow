import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jwtVerify, SignJWT } from "jose";
import type { Env } from "../config/env.js";
import { SESSION_DAYS } from "./session.js";

// Login tokens (JWT, signed with JWT_SECRET). The token holds only the user's id and their
// sessionVersion: role and agency are read from the database on each request, so a changed role or
// a removed user applies at once, not when an old token runs out. The same goes for the version:
// once the user's number goes up (log out of all devices, a new password), older tokens stop working.
export type TokenSession = { userId: string; version: number };

@Injectable()
export class SessionService {
  private readonly key: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get("JWT_SECRET", { infer: true }));
  }

  sign(user: { id: string; sessionVersion: number }): Promise<string> {
    return new SignJWT({ ver: user.sessionVersion })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DAYS}d`)
      .sign(this.key);
  }

  // What a valid token says; null when the token is missing, expired, or not signed by us.
  // A token from before versions existed has no "ver": it counts as 0, the number every user started
  // with - so this update logs nobody out.
  async verify(token: string | null): Promise<TokenSession | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      if (!payload.sub) return null;
      const version = payload.ver ?? 0;
      return typeof version === "number" ? { userId: payload.sub, version } : null;
    } catch {
      return null;
    }
  }
}
