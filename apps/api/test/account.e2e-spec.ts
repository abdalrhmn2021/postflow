import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { EMAILS_PER_ADDRESS, FORGOT_PER_IP } from "../src/auth/rate-limit.service.js";
import { Mailer } from "../src/mail/mailer.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { RedisService } from "../src/redis/redis.service.js";
import { startApp, uniqueRun } from "./app.js";
import { FakeMailer } from "./fake-mailer.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";
const token = (mail: Parameters<typeof FakeMailer.token>[0]) => FakeMailer.token(mail);

type Agent = ReturnType<typeof request.agent>;

describe("confirming the email, forgetting and changing the password", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mailer: FakeMailer;
  const redisKeys: string[] = [];

  // Each request from its own made-up IP, so the per-IP limits of one test don't touch another.
  let ipCounter = 0;
  const newIp = () => {
    const ip = `203.0.114.${++ipCounter}`;
    redisKeys.push(`login-attempts:${ip}`, `forgot-ip:${ip}`);
    return ip;
  };

  async function signUp(who: string, lang = "ar") {
    const email = `${who}@${RUN}.test`;
    redisKeys.push(`mail-to:${email}`);
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/auth/register")
      .send({ agencyName: `Agency ${who}`, slug: `${RUN}-${who}`, name: "عبد الرحمن", email, password: PASSWORD, lang })
      .expect(201);
    redisKeys.push(`verify-mail:${res.body.user.id}`, `password-check:${res.body.user.id}`);
    return { agent, email, userId: res.body.user.id as string, body: res.body };
  }

  async function login(email: string, password = PASSWORD): Promise<Agent> {
    const agent = request.agent(app.getHttpServer());
    await agent.post("/api/auth/login").set("X-Forwarded-For", newIp()).send({ email, password }).expect(200);
    return agent;
  }

  const forgot = (email: string, ip = newIp(), lang = "en") =>
    request(app.getHttpServer()).post("/api/auth/forgot-password").set("X-Forwarded-For", ip).send({ email, lang });
  const reset = (t: string, password: string) =>
    request(app.getHttpServer()).post("/api/auth/reset-password").send({ token: t, password });
  const verify = (t: string) => request(app.getHttpServer()).post("/api/auth/verify-email").send({ token: t });

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    mailer = app.get(Mailer) as FakeMailer;
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    if (redisKeys.length > 0) await app?.get(RedisService).client.del(...redisKeys);
    await app?.close();
  });

  describe("confirming the email", () => {
    it("sign-up sends the 'confirm your email' mail in the page's language; the link confirms it", async () => {
      const { agent, email, body } = await signUp("verify", "en");
      expect(body.user.emailVerified).toBe(false);

      const mail = await mailer.waitFor(email);
      expect(mail.subject).toBe("Confirm your email for PostFlow");
      expect(mail.text).toMatch(/http:\/\/localhost:3000\/en\/verify-email\/[\w-]{43}/);

      await verify(token(mail)).expect(204); // no login needed: the link may open on the phone
      expect((await agent.get("/api/auth/me").expect(200)).body.user.emailVerified).toBe(true);

      // Opened again: the link is used up.
      expect((await verify(token(mail)).expect(404)).body.code).toBe("VERIFY_LINK_INVALID");
    });

    it("'send it again' replaces the old link; once confirmed, nothing more is sent", async () => {
      const { agent, email } = await signUp("resend");
      const first = await mailer.waitFor(email);

      await agent.post("/api/auth/verify-email/send").send({ lang: "ar" }).expect(204);
      const second = await mailer.waitFor(email, 2);
      expect(second.subject).toBe("أكّد إيميلك في PostFlow");

      await verify(token(first)).expect(404); // only the newest link works
      await verify(token(second)).expect(204);

      await agent.post("/api/auth/verify-email/send").send({ lang: "ar" }).expect(204);
      await new Promise((r) => setTimeout(r, 100));
      expect(mailer.to(email)).toHaveLength(2);

      await request(app.getHttpServer()).post("/api/auth/verify-email/send").send({}).expect(401);
    });

    it(`at most ${EMAILS_PER_ADDRESS} resends an hour`, async () => {
      const { agent } = await signUp("resend-limit");
      for (let i = 0; i < EMAILS_PER_ADDRESS; i++) {
        await agent.post("/api/auth/verify-email/send").send({}).expect(204);
      }
      const res = await agent.post("/api/auth/verify-email/send").send({}).expect(429);
      expect(res.body.code).toBe("TOO_MANY_EMAILS");
    });

    it("a wrong link, or a reset link used to confirm, doesn't work", async () => {
      await verify("made-up").expect(404);
      const { email } = await signUp("wrong-kind");
      await forgot(email).expect(204);
      const resetMail = await mailer.waitFor(email, 2); // 1 = confirm, 2 = reset
      await verify(token(resetMail)).expect(404);
      await reset(token(resetMail), "another-long-password").expect(204); // still fine for its own purpose
    });

    it("the sign-up works even when the email service is down", async () => {
      mailer.failNext = true;
      const { body } = await signUp("mail-down");
      expect(body.user.emailVerified).toBe(false);
    });
  });

  describe("forgot password", () => {
    it("answers the same for an email with no account - and sends nothing", async () => {
      const nobody = `nobody@${RUN}.test`;
      redisKeys.push(`mail-to:${nobody}`);
      await forgot(nobody).expect(204);
      await new Promise((r) => setTimeout(r, 200));
      expect(mailer.to(nobody)).toHaveLength(0);
    });

    it("the link sets a new password, ends every login, confirms the email, and works once", async () => {
      const { agent, email } = await signUp("reset");
      const laptop = await login(email);

      await forgot(email.toUpperCase()).expect(204); // the address as typed - stored lower-case
      const mail = await mailer.waitFor(email, 2);
      expect(mail.subject).toBe("Reset your PostFlow password");
      expect(mail.text).toMatch(/\/en\/reset-password\/[\w-]{43}/);

      const bad = await reset(token(mail), "short").expect(400);
      expect(bad.body.fields.password).toBe("At least 8 characters");

      await reset(token(mail), "the-new-password").expect(204);
      await agent.get("/api/auth/me").expect(401); // every login ended
      await laptop.get("/api/auth/me").expect(401);

      await request(app.getHttpServer())
        .post("/api/auth/login")
        .set("X-Forwarded-For", newIp())
        .send({ email, password: PASSWORD })
        .expect(401);
      const me = await (await login(email, "the-new-password")).get("/api/auth/me").expect(200);
      expect(me.body.user.emailVerified).toBe(true); // they got our email: it's theirs

      expect((await reset(token(mail), "yet-another-password").expect(404)).body.code).toBe("RESET_LINK_INVALID");
    });

    it("an expired link, or an older one after asking again, doesn't work", async () => {
      const { email, userId } = await signUp("reset-old");
      await forgot(email).expect(204);
      const first = await mailer.waitFor(email, 2);
      await forgot(email).expect(204);
      const second = await mailer.waitFor(email, 3);
      await reset(token(first), "the-new-password").expect(404);

      await prisma.emailToken.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await reset(token(second), "the-new-password").expect(404);
    });

    it(`sends at most ${EMAILS_PER_ADDRESS} emails an hour to one address, still answering 204`, async () => {
      const { email } = await signUp("flood"); // email 1: confirm
      for (let i = 0; i < EMAILS_PER_ADDRESS + 2; i++) await forgot(email).expect(204);
      await new Promise((r) => setTimeout(r, 300));
      expect(mailer.to(email)).toHaveLength(EMAILS_PER_ADDRESS); // the confirm mail counts too
    });

    it(`answers 429 after ${FORGOT_PER_IP} requests from one IP`, async () => {
      const ip = newIp();
      for (let i = 0; i < FORGOT_PER_IP; i++) await forgot(`x${i}@${RUN}.test`, ip).expect(204);
      const res = await forgot(`x@${RUN}.test`, ip).expect(429);
      expect(res.body.code).toBe("TOO_MANY_EMAILS");
      for (let i = 0; i < FORGOT_PER_IP; i++) redisKeys.push(`mail-to:x${i}@${RUN}.test`);
    });
  });

  describe("changing the password", () => {
    it("needs the current password; keeps this login, ends the others and old reset links", async () => {
      const { agent, email } = await signUp("change");
      const phone = await login(email);
      await forgot(email).expect(204);
      const resetMail = await mailer.waitFor(email, 2);

      const wrong = await agent
        .post("/api/auth/change-password")
        .send({ currentPassword: "not-it", newPassword: "the-new-password" })
        .expect(400);
      expect(wrong.body.code).toBe("WRONG_PASSWORD");

      await agent
        .post("/api/auth/change-password")
        .send({ currentPassword: PASSWORD, newPassword: "the-new-password" })
        .expect(204);
      await agent.get("/api/auth/me").expect(200); // this browser stays logged in
      await phone.get("/api/auth/me").expect(401); // the other one is out
      await reset(token(resetMail), "someone-elses-password").expect(404);
      await login(email, "the-new-password");
    });

    it("at most 5 tries of the current password in 15 minutes", async () => {
      const { agent } = await signUp("change-limit");
      for (let i = 0; i < 5; i++) {
        await agent
          .post("/api/auth/change-password")
          .send({ currentPassword: "guess", newPassword: "x".repeat(8) })
          .expect(400);
      }
      const res = await agent
        .post("/api/auth/change-password")
        .send({ currentPassword: PASSWORD, newPassword: "the-new-password" })
        .expect(429);
      expect(res.body.code).toBe("TOO_MANY_ATTEMPTS");
    });

    it("needs a login", async () => {
      await request(app.getHttpServer())
        .post("/api/auth/change-password")
        .send({ currentPassword: PASSWORD, newPassword: "the-new-password" })
        .expect(401);
    });
  });
});
