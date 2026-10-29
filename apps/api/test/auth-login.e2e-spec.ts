import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { LOGIN_ATTEMPTS } from "../src/auth/login-limit.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { RedisService } from "../src/redis/redis.service.js";
import { startApp, uniqueRun } from "./app.js";

const RUN = uniqueRun();
const EMAIL = `owner@${RUN}.test`;
const PASSWORD = "a-long-password";

// Each test logs in from its own made-up IP (X-Forwarded-For, trusted from localhost),
// so the 5-per-minute limit of one test doesn't affect another.
let ipCounter = 0;
const ips: string[] = [];
function newIp() {
  const ip = `203.0.113.${++ipCounter}`;
  ips.push(ip);
  return ip;
}

function sessionCookie(res: request.Response): string | undefined {
  const cookies = res.headers["set-cookie"] as unknown as string[] | undefined;
  return cookies?.find((c) => c.startsWith("pf_session="));
}

describe("login, me and logout", () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await startApp();
    await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ agencyName: "سنتريفا", slug: `${RUN}-centriva`, name: "عبد الرحمن", email: EMAIL, password: PASSWORD })
      .expect(201);
  });

  afterAll(async () => {
    await app?.get(PrismaService).agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await Promise.all(ips.map((ip) => app?.get(RedisService).client.del(`login-attempts:${ip}`)));
    await app?.close();
  });

  const login = (body: object, ip = newIp()) =>
    request(app.getHttpServer()).post("/api/auth/login").set("X-Forwarded-For", ip).send(body);

  it("register already signs the new owner in", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ agencyName: "Other", slug: `${RUN}-other`, name: "Other", email: `o@${RUN}.test`, password: PASSWORD })
      .expect(201);
    expect(sessionCookie(res)).toBeDefined();
  });

  it("logs in with the right password: an httpOnly, SameSite=Lax cookie, and no password in the body", async () => {
    const res = await login({ email: EMAIL.toUpperCase(), password: PASSWORD }).expect(200);

    expect(res.body.user).toMatchObject({ email: EMAIL, role: "OWNER" });
    expect(res.body.agency).toMatchObject({ slug: `${RUN}-centriva` });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Max-Age=604800/); // 7 days
  });

  it("answers a wrong password and an unknown email the same way", async () => {
    const wrongPassword = await login({ email: EMAIL, password: "not-the-password" }).expect(401);
    const unknownEmail = await login({ email: `nobody@${RUN}.test`, password: PASSWORD }).expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.code).toBe("INVALID_CREDENTIALS");
    expect(sessionCookie(wrongPassword)).toBeUndefined();
  });

  it(`allows ${LOGIN_ATTEMPTS} attempts a minute from one IP, then answers 429`, async () => {
    const ip = newIp();
    for (let i = 0; i < LOGIN_ATTEMPTS; i++) {
      await login({ email: EMAIL, password: "wrong" }, ip).expect(401);
    }
    // Even the right password is refused now: the point is to stop guessing.
    const blocked = await login({ email: EMAIL, password: PASSWORD }, ip).expect(429);
    expect(blocked.body.code).toBe("TOO_MANY_ATTEMPTS");
    expect(blocked.body.retryAfter).toBeGreaterThan(0);

    // Another visitor is not affected.
    await login({ email: EMAIL, password: PASSWORD }).expect(200);
  });

  it("GET /me tells who is signed in, and logout ends it", async () => {
    const agent = request.agent(app.getHttpServer()); // keeps cookies between requests, like a browser
    await agent.post("/api/auth/login").set("X-Forwarded-For", newIp()).send({ email: EMAIL, password: PASSWORD });

    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user.email).toBe(EMAIL);
    expect(me.body.agency.slug).toBe(`${RUN}-centriva`);

    await agent.post("/api/auth/logout").expect(204);
    const after = await agent.get("/api/auth/me").expect(401);
    expect(after.body.code).toBe("UNAUTHENTICATED");
  });

  it("GET /me refuses no cookie and a forged cookie", async () => {
    await request(app.getHttpServer()).get("/api/auth/me").expect(401);
    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Cookie", "pf_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.forged")
      .expect(401);
  });

  it("logs out a user who was deleted, even with a valid token", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post("/api/auth/register")
      .send({ agencyName: "Gone", slug: `${RUN}-gone`, name: "Gone", email: `gone@${RUN}.test`, password: PASSWORD })
      .expect(201);
    await app.get(PrismaService).agency.delete({ where: { slug: `${RUN}-gone` } });

    await agent.get("/api/auth/me").expect(401);
  });
});
