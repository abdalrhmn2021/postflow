import { ConfigService } from "@nestjs/config";
import { SignJWT } from "jose";
import type { PrismaService } from "../prisma/prisma.service.js";
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
  const key = new TextEncoder().encode(secret);

  // A stand-in for the Session table: create gives ids s1, s2 ...; deleteMany records what it was asked.
  function setup(jwtSecret = secret) {
    const deleted: unknown[] = [];
    let n = 0;
    const prisma = {
      session: {
        create: () => Promise.resolve({ id: `s${++n}` }),
        deleteMany: ({ where }: { where: unknown }) => {
          deleted.push(where);
          return Promise.resolve({ count: 1 });
        },
      },
    } as unknown as PrismaService;
    return { sessions: new SessionService(new ConfigService({ JWT_SECRET: jwtSecret }) as never, prisma), deleted };
  }

  it("gives back the login and the user from a token it made", async () => {
    const { sessions } = setup();
    expect(await sessions.verify(await sessions.start("user-1"))).toEqual({ sessionId: "s1", userId: "user-1" });
  });

  it("rejects a token signed with another secret", async () => {
    const other = setup(`${secret}-other`).sessions;
    expect(await setup().sessions.verify(await other.start("user-1"))).toBeNull();
  });

  it("rejects an expired token, a changed token and garbage", async () => {
    const { sessions } = setup();
    const expired = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setJti("s1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    expect(await sessions.verify(expired)).toBeNull();

    const token = await sessions.start("user-1");
    expect(await sessions.verify(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(await sessions.verify("not-a-token")).toBeNull();
    expect(await sessions.verify(null)).toBeNull();
  });

  it("rejects a token from before logins were stored (no session id in it)", async () => {
    const old = await new SignJWT()
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-1")
      .setExpirationTime("7d")
      .sign(key);
    expect(await setup().sessions.verify(old)).toBeNull();
  });

  it("end() closes that login only; a bad token closes nothing", async () => {
    const { sessions, deleted } = setup();
    await sessions.end(await sessions.start("user-1"));
    await sessions.end("not-a-token");
    await sessions.end(null);
    expect(deleted).toEqual([{ id: "s1" }]);
  });

  it("endAll() closes every login of the user", async () => {
    const { sessions, deleted } = setup();
    await sessions.endAll("user-1");
    expect(deleted).toEqual([{ userId: "user-1" }]);
  });
});
