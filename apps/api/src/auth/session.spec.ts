import { ConfigService } from "@nestjs/config";
import { SignJWT } from "jose";
import { readCookie } from "./session.js";
import { SessionService } from "./session.service.js";

describe("readCookie", () => {
  it("finds one cookie among several", () => {
    expect(readCookie("theme=dark; pf_session=abc.def; lang=ar", "pf_session")).toBe("abc.def");
  });

  it("returns null when the cookie or the header is missing", () => {
    expect(readCookie("theme=dark", "pf_session")).toBeNull();
    expect(readCookie(undefined, "pf_session")).toBeNull();
  });
});

describe("SessionService", () => {
  const secret = "a-test-secret-that-is-at-least-32-characters-long";
  const sessions = new SessionService(new ConfigService({ JWT_SECRET: secret }) as never);

  it("gives back the user id from a token it signed", async () => {
    expect(await sessions.verify(await sessions.sign("user-1"))).toBe("user-1");
  });

  it("rejects a token signed with another secret", async () => {
    const other = new SessionService(new ConfigService({ JWT_SECRET: `${secret}-other` }) as never);
    expect(await sessions.verify(await other.sign("user-1"))).toBeNull();
  });

  it("rejects an expired token, a changed token and garbage", async () => {
    const expired = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(secret));
    expect(await sessions.verify(expired)).toBeNull();

    const token = await sessions.sign("user-1");
    expect(await sessions.verify(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(await sessions.verify("not-a-token")).toBeNull();
    expect(await sessions.verify(null)).toBeNull();
  });
});
