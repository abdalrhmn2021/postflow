import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { LOGIN_ATTEMPTS } from "../src/auth/rate-limit.service.js";
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

  it("logout closes the login itself: a copy of the cookie stops working too", async () => {
    const res = await login({ email: EMAIL, password: PASSWORD }).expect(200);
    const cookie = sessionCookie(res)!.split(";")[0]; // pf_session=<token>, as a thief would copy it
    const me = () => request(app.getHttpServer()).get("/api/auth/me").set("Cookie", cookie);

    await me().expect(200);
    await request(app.getHttpServer()).post("/api/auth/logout").set("Cookie", cookie).expect(204);
    await me().expect(401); // the token is still in date and correctly signed - its login is gone
  });

  it("logout on one device leaves the other devices logged in", async () => {
    const phone = request.agent(app.getHttpServer());
    const laptop = request.agent(app.getHttpServer());
    await phone.post("/api/auth/login").set("X-Forwarded-For", newIp()).send({ email: EMAIL, password: PASSWORD });
    await laptop.post("/api/auth/login").set("X-Forwarded-For", newIp()).send({ email: EMAIL, password: PASSWORD });

    await phone.post("/api/auth/logout").expect(204);
    await phone.get("/api/auth/me").expect(401);
    await laptop.get("/api/auth/me").expect(200);
  });

  it("logout-all ends every login of the person, and only theirs", async () => {
    const other = request.agent(app.getHttpServer());
    await other
      .post("/api/auth/register")
      .send({ agencyName: "Other2", slug: `${RUN}-other2`, name: "O2", email: `o2@${RUN}.test`, password: PASSWORD })
      .expect(201);

    const phone = request.agent(app.getHttpServer());
    const laptop = request.agent(app.getHttpServer());
    await phone.post("/api/auth/login").set("X-Forwarded-For", newIp()).send({ email: EMAIL, password: PASSWORD });
    await laptop.post("/api/auth/login").set("X-Forwarded-For", newIp()).send({ email: EMAIL, password: PASSWORD });

    const res = await laptop.post("/api/auth/logout-all").expect(204);
    expect(sessionCookie(res)).toMatch(/^pf_session=;/); // this browser's cookie removed too
    await phone.get("/api/auth/me").expect(401);
    await laptop.get("/api/auth/me").expect(401);
    await other.get("/api/auth/me").expect(200); // someone else's login is untouched

    await request(app.getHttpServer()).post("/api/auth/logout-all").expect(401); // needs a login
  });

  it("a login stored in the database is refused once its time is over", async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/auth/login").set("X-Forwarded-For", newIp()).send({ email: EMAIL, password: PASSWORD });
    const prisma = app.get(PrismaService);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const newest = await prisma.session.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    await prisma.session.update({ where: { id: newest.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    await agent.get("/api/auth/me").expect(401);
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
