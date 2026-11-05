import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { vi } from "vitest";
import { hashToken } from "../src/auth/email-auth.service.js";
import { Mailer } from "../src/mail/mailer.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { startApp, TEST_AUTH_LIMITS, uniqueRun } from "./app.js";
import type { FakeMailer } from "./fake-mailer.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";
const NEW_PASSWORD = "a-brand-new-password";

let ipCounter = 0;
const newIp = () => `198.18.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

describe("email confirmation and password reset", () => {
  let app: INestApplication<App>;
  let mailer: FakeMailer;
  let prisma: PrismaService;
  let n = 0;

  beforeAll(async () => {
    // Limits of this file's own (own Redis key names), so other files' emails don't count against them.
    app = await startApp(undefined, {
      ...TEST_AUTH_LIMITS,
      emailPerAddress: { name: `emails-to-${RUN}`, max: 3, windowSeconds: 60 },
    });
    mailer = app.get(Mailer) as FakeMailer;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await app?.close();
  });

  // A new agency owner, logged in on `agent`.
  async function signUp(lang?: "ar" | "en") {
    const email = `owner${++n}@${RUN}.test`;
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/auth/register")
      .send({ agencyName: "سنتريفا", slug: `${RUN}-a${n}`, name: "عبد الرحمن", email, password: PASSWORD, lang })
      .expect(201);
    return { email, agent, res };
  }

  const waitForEmail = (email: string, count = 1) =>
    vi.waitFor(() => expect(mailer.to(email)).toHaveLength(count), { timeout: 5000 });

  const http = () => request(app.getHttpServer());

  describe("confirming the email", () => {
    it("sends a confirmation email in the site's language after sign-up; the account starts unconfirmed", async () => {
      const { email, agent, res } = await signUp("en");
      expect(res.body.user.emailVerified).toBe(false);

      await waitForEmail(email);
      const [message] = mailer.to(email);
      expect(message.subject).toBe("Confirm your email on PostFlow");
      expect(message.link).toMatch(/^http:\/\/localhost:3000\/en\/verify-email\/[\w-]{43}$/);
      // Only the hash is stored, never the secret from the link.
      const token = mailer.lastToken(email)!;
      expect(await prisma.emailToken.count({ where: { tokenHash: token } })).toBe(0);
      expect(await prisma.emailToken.count({ where: { tokenHash: hashToken(token) } })).toBe(1);

      expect((await agent.get("/api/auth/me").expect(200)).body.user.emailVerified).toBe(false);
    });

    it("confirms with the link - without a login, and again when opened twice", async () => {
      const { email, agent } = await signUp();
      await waitForEmail(email);
      expect(mailer.to(email)[0].subject).toBe("أكّد إيميلك على PostFlow"); // Arabic when no language is sent

      const token = mailer.lastToken(email)!;
      expect((await http().post("/api/auth/verify-email").send({ token }).expect(200)).body).toEqual({
        emailVerified: true,
      });
      expect((await agent.get("/api/auth/me").expect(200)).body.user.emailVerified).toBe(true);

      await http().post("/api/auth/verify-email").send({ token }).expect(200);
    });

    it("refuses a wrong or expired link with 404 VERIFY_LINK_INVALID", async () => {
      const wrong = await http()
        .post("/api/auth/verify-email")
        .send({ token: "x".repeat(43) })
        .expect(404);
      expect(wrong.body.code).toBe("VERIFY_LINK_INVALID");

      const { email } = await signUp();
      await waitForEmail(email);
      const token = mailer.lastToken(email)!;
      await prisma.emailToken.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date() } });
      await http().post("/api/auth/verify-email").send({ token }).expect(404);
    });

    it("sends it again on request; the older link stops working", async () => {
      const { email, agent } = await signUp();
      await waitForEmail(email);
      const first = mailer.lastToken(email)!;

      await agent
        .post("/api/auth/resend-verification")
        .set("X-Forwarded-For", newIp())
        .send({ lang: "en" })
        .expect(204);
      expect(mailer.to(email)).toHaveLength(2);
      expect(mailer.to(email)[1].subject).toBe("Confirm your email on PostFlow");

      await http().post("/api/auth/verify-email").send({ token: first }).expect(404);
      await http()
        .post("/api/auth/verify-email")
        .send({ token: mailer.lastToken(email) })
        .expect(200);

      const again = await agent.post("/api/auth/resend-verification").send({}).expect(409);
      expect(again.body.code).toBe("ALREADY_VERIFIED");
    });

    it("says so when the email can't be sent (502 EMAIL_FAILED) - and sign-up still works without it", async () => {
      mailer.failing = true;
      try {
        const { agent } = await signUp(); // 201 even though the email failed
        const res = await agent.post("/api/auth/resend-verification").send({}).expect(502);
        expect(res.body.code).toBe("EMAIL_FAILED");
      } finally {
        mailer.failing = false;
      }
    });

    it("needs a login to send it again", async () => {
      await http().post("/api/auth/resend-verification").send({}).expect(401);
    });

    it("sends one to a staff member who accepted an invite", async () => {
      const { agent } = await signUp();
      const invite = await agent
        .post("/api/invites")
        .send({ email: `staff@${RUN}.test`, role: "EDITOR" })
        .expect(201);
      const token = invite.body.link.split("/").pop();
      const res = await http()
        .post("/api/invites/accept")
        .send({ token, name: "سارة", password: PASSWORD, lang: "en" })
        .expect(201);
      expect(res.body.user.emailVerified).toBe(false);
      await waitForEmail(`staff@${RUN}.test`);
      expect(mailer.to(`staff@${RUN}.test`)[0].subject).toBe("Confirm your email on PostFlow");
    });
  });

  describe("a forgotten password", () => {
    const forgot = (email: string, lang?: string) =>
      http().post("/api/auth/forgot-password").set("X-Forwarded-For", newIp()).send({ email, lang });

    it("answers 204 for an email without an account, and sends nothing", async () => {
      await forgot(`nobody@${RUN}.test`).expect(204);
      await new Promise((r) => setTimeout(r, 200));
      expect(mailer.to(`nobody@${RUN}.test`)).toHaveLength(0);
    });

    it("emails a link that sets a new password, logs out the other devices, and logs this one in", async () => {
      const { email, agent: laptop } = await signUp();
      await laptop.get("/api/auth/me").expect(200);

      await forgot(email.toUpperCase(), "en").expect(204);
      await waitForEmail(email, 2); // the confirmation, then this
      const message = mailer.to(email)[1];
      expect(message.subject).toBe("Reset your PostFlow password");
      expect(message.link).toMatch(/\/en\/reset-password\/[\w-]{43}$/);
      const token = mailer.lastToken(email)!;

      expect((await http().get(`/api/auth/reset-password/${token}`).expect(200)).body).toEqual({ email });

      const phone = request.agent(app.getHttpServer());
      const res = await phone.post("/api/auth/reset-password").send({ token, password: NEW_PASSWORD }).expect(200);
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.emailVerified).toBe(true); // the link came to their inbox
      await phone.get("/api/auth/me").expect(200);
      await laptop.get("/api/auth/me").expect(401);

      const login = (password: string) =>
        http().post("/api/auth/login").set("X-Forwarded-For", newIp()).send({ email, password });
      await login(PASSWORD).expect(401);
      await login(NEW_PASSWORD).expect(200);

      // The link works once.
      const used = await http().post("/api/auth/reset-password").send({ token, password: PASSWORD }).expect(404);
      expect(used.body.code).toBe("RESET_LINK_INVALID");
      await http().get(`/api/auth/reset-password/${token}`).expect(404);
    });

    it("refuses an expired link, a confirmation link, and a short password", async () => {
      const { email } = await signUp();
      await waitForEmail(email);
      const confirmToken = mailer.lastToken(email)!;
      await http().post("/api/auth/reset-password").send({ token: confirmToken, password: NEW_PASSWORD }).expect(404);

      await forgot(email).expect(204);
      await waitForEmail(email, 2);
      const token = mailer.lastToken(email)!;

      const short = await http().post("/api/auth/reset-password").send({ token, password: "short" }).expect(400);
      expect(short.body.fields.password).toBeDefined();

      await prisma.emailToken.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date() } });
      await http().post("/api/auth/reset-password").send({ token, password: NEW_PASSWORD }).expect(404);
    });

    it("a newer reset link replaces the older one", async () => {
      const { email } = await signUp();
      await forgot(email).expect(204);
      await waitForEmail(email, 2);
      const first = mailer.lastToken(email)!;
      await forgot(email).expect(204);
      await waitForEmail(email, 3);

      await http().get(`/api/auth/reset-password/${first}`).expect(404);
      await http()
        .get(`/api/auth/reset-password/${mailer.lastToken(email)}`)
        .expect(200);
    });

    it("sends at most 3 an hour to one address (429 TOO_MANY_EMAILS), with or without an account", async () => {
      const address = `flood@${RUN}.test`;
      for (let i = 0; i < 3; i++) await forgot(address).expect(204);
      const blocked = await forgot(address).expect(429);
      expect(blocked.body.code).toBe("TOO_MANY_EMAILS");
      expect(blocked.body.retryAfter).toBeGreaterThan(0);
    });
  });
});
