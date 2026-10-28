import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { jwtVerify, SignJWT } from "jose";
import type { Env } from "../config/env.js";
import { SESSION_DAYS } from "./session.js";

// Login tokens (JWT, signed with JWT_SECRET). The token holds only the user's id: role and agency are
// read from the database on each request, so a changed role or a removed user applies at once,
// not when an old token runs out.
@Injectable()
export class SessionService {
  private readonly key: Uint8Array;

  constructor(config: ConfigService<Env, true>) {
    this.key = new TextEncoder().encode(config.get("JWT_SECRET", { infer: true }));
  }

  sign(userId: string): Promise<string> {
    return new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${SESSION_DAYS}d`)
      .sign(this.key);
  }

  // The user id inside a valid token; null when the token is missing, expired, or not signed by us.
  async verify(token: string | null): Promise<string | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
