import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { startApp, uniqueRun } from "./app.js";

// Every agency made here has a slug starting with this, so afterAll removes exactly these
// (and, through onDelete: Cascade, their users) - even when the tests run against a dev database.
const RUN = uniqueRun();

function signUp(app: INestApplication<App>, change: Record<string, unknown> = {}) {
  return request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      agencyName: "سنتريفا",
      slug: `${RUN}-centriva`,
      name: "عبد الرحمن",
      email: `owner@${RUN}.test`,
      password: "a-long-password",
      ...change,
    });
}

describe("POST /api/auth/register", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await app?.close();
  });

  it("creates the agency and its owner, and never returns the password", async () => {
    const res = await signUp(app).expect(201);

    expect(res.body.agency).toMatchObject({ name: "سنتريفا", slug: `${RUN}-centriva`, plan: "FREE" });
    expect(res.body.user).toMatchObject({ name: "عبد الرحمن", email: `owner@${RUN}.test`, role: "OWNER" });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^pf_session=/); // signed in straight away

    const saved = await prisma.user.findUniqueOrThrow({ where: { email: `owner@${RUN}.test` } });
    expect(saved.agencyId).toBe(res.body.agency.id);
    expect(saved.passwordHash).toMatch(/^scrypt\$/);
  });

  it("answers 409 EMAIL_TAKEN for an email that already has an account, in any letter case", async () => {
    const res = await signUp(app, { slug: `${RUN}-other`, email: `OWNER@${RUN}.TEST` }).expect(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
    // Nothing half-made: the second agency wasn't saved.
    expect(await prisma.agency.count({ where: { slug: `${RUN}-other` } })).toBe(0);
  });

  it("answers 409 SLUG_TAKEN for a link name in use, and for a reserved one", async () => {
    const taken = await signUp(app, { email: `second@${RUN}.test` }).expect(409);
    expect(taken.body.code).toBe("SLUG_TAKEN");

    const reserved = await signUp(app, { slug: "admin", email: `third@${RUN}.test` }).expect(409);
    expect(reserved.body.code).toBe("SLUG_TAKEN");
  });

  it("answers 400 with one message per bad field", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ agencyName: "سنتريفا", slug: "مش رابط", email: "nope", password: "123" })
      .expect(400);

    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.fields).sort()).toEqual(["email", "name", "password", "slug"]);
  });
});
