import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { hashInviteToken } from "../src/invites/invite-token.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { startApp, uniqueRun } from "./app.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";

type Agent = ReturnType<typeof request.agent>;

// The secret at the end of a link: http://localhost:3000/invite/<token>
const tokenOf = (link: string) => link.split("/invite/")[1]!;

describe("staff invites", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerA: Agent, ownerB: Agent;
  let agencyAId: string;

  async function registerOwner(slug: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/auth/register")
      .send({
        agencyName: `Agency ${slug}`,
        slug: `${RUN}-${slug}`,
        name: "Owner",
        email: `owner@${slug}.${RUN}.test`,
        password: PASSWORD,
      })
      .expect(201);
    return { agent, agencyId: res.body.agency.id as string };
  }

  const invite = (agent: Agent, email: string, role = "EDITOR") => agent.post("/api/invites").send({ email, role });
  const accept = (agent: Agent, token: string, name = "سارة") =>
    agent.post("/api/invites/accept").send({ token, name, password: PASSWORD });

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);
    const a = await registerOwner("a");
    ownerA = a.agent;
    agencyAId = a.agencyId;
    ownerB = (await registerOwner("b")).agent;
  });

  afterAll(async () => {
    // Cascade: the agencies' users and invites go with them.
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await app?.close();
  });

  it("the owner invites an editor and gets a link; the list never shows the link or its hash", async () => {
    const email = `editor1@a.${RUN}.test`;
    const res = await invite(ownerA, email.toUpperCase()).expect(201);
    expect(res.body).toMatchObject({ email, role: "EDITOR", invitedBy: { name: "Owner" } });
    expect(res.body.link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
    expect(res.body.tokenHash).toBeUndefined();

    // The database keeps the hash only.
    const saved = await prisma.invite.findFirstOrThrow({ where: { agencyId: agencyAId, email } });
    expect(saved.tokenHash).toBe(hashInviteToken(tokenOf(res.body.link)));
    expect(saved.tokenHash).not.toContain(tokenOf(res.body.link));

    const list = await ownerA.get("/api/invites").expect(200);
    const row = list.body.find((i: { email: string }) => i.email === email);
    expect(row).toBeDefined();
    expect(row.link).toBeUndefined();
    expect(row.tokenHash).toBeUndefined();
  });

  it("the link shows the agency and role, makes the account, logs in, and works only once", async () => {
    const email = `manager@a.${RUN}.test`;
    const token = tokenOf((await invite(ownerA, email, "MANAGER").expect(201)).body.link);
    const visitor = request.agent(app.getHttpServer());

    const preview = await visitor.get(`/api/invites/accept/${token}`).expect(200);
    expect(preview.body).toEqual({ email, role: "MANAGER", agency: { name: "Agency a", slug: `${RUN}-a` } });

    const res = await accept(visitor, token).expect(201);
    expect(res.body.user).toMatchObject({ email, name: "سارة", role: "MANAGER" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.agency.id).toBe(agencyAId);

    // Logged in straight away, in agency A.
    const me = await visitor.get("/api/auth/me").expect(200);
    expect(me.body.user.email).toBe(email);

    // ... and can log in later with the password chosen.
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("X-Forwarded-For", "192.0.2.10")
      .send({ email, password: PASSWORD })
      .expect(200);

    // Used: the same link no longer works, and the invite left the list.
    expect((await accept(request(app.getHttpServer()), token).expect(404)).body.code).toBe("INVITE_INVALID");
    await visitor.get(`/api/invites/accept/${token}`).expect(404);
    const list = await ownerA.get("/api/invites").expect(200);
    expect(list.body.some((i: { email: string }) => i.email === email)).toBe(false);

    // A manager may not invite (owner only).
    await invite(visitor, `x@a.${RUN}.test`).expect(403);
  });

  it("refuses an email that already has an account, and an owner role", async () => {
    const taken = await invite(ownerA, `owner@b.${RUN}.test`).expect(409); // agency B's owner
    expect(taken.body.code).toBe("EMAIL_TAKEN");
    await invite(ownerA, `someone@a.${RUN}.test`, "OWNER").expect(400);
  });

  it("inviting the same email again gives a new link and the old one stops working", async () => {
    const email = `editor2@a.${RUN}.test`;
    const first = tokenOf((await invite(ownerA, email).expect(201)).body.link);
    const second = tokenOf((await invite(ownerA, email, "MANAGER").expect(201)).body.link);
    expect(second).not.toBe(first);

    expect(await prisma.invite.count({ where: { agencyId: agencyAId, email } })).toBe(1);
    await request(app.getHttpServer()).get(`/api/invites/accept/${first}`).expect(404);
    const preview = await request(app.getHttpServer()).get(`/api/invites/accept/${second}`).expect(200);
    expect(preview.body.role).toBe("MANAGER"); // the new role applies
  });

  it("refuses an expired link", async () => {
    const email = `late@a.${RUN}.test`;
    const token = tokenOf((await invite(ownerA, email).expect(201)).body.link);
    await prisma.invite.update({
      where: { tokenHash: hashInviteToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer()).get(`/api/invites/accept/${token}`).expect(404);
    const res = await accept(request.agent(app.getHttpServer()), token).expect(404);
    expect(res.body.code).toBe("INVITE_INVALID");
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("another agency can't see or cancel the invite; the owner cancels it and the link stops working", async () => {
    const email = `cancel@a.${RUN}.test`;
    const res = await invite(ownerA, email).expect(201);
    const { id } = res.body;

    const listB = await ownerB.get("/api/invites").expect(200);
    expect(listB.body.some((i: { id: string }) => i.id === id)).toBe(false);
    expect((await ownerB.delete(`/api/invites/${id}`).expect(404)).body.code).toBe("INVITE_NOT_FOUND");

    await ownerA.delete(`/api/invites/${id}`).expect(204);
    await request(app.getHttpServer())
      .get(`/api/invites/accept/${tokenOf(res.body.link)}`)
      .expect(404);
    await ownerA.delete(`/api/invites/${id}`).expect(404);
  });

  it("refuses a made-up link and a short password", async () => {
    const madeUp = "A".repeat(43);
    await request(app.getHttpServer()).get(`/api/invites/accept/${madeUp}`).expect(404);

    const token = tokenOf((await invite(ownerA, `short@a.${RUN}.test`).expect(201)).body.link);
    const res = await request(app.getHttpServer())
      .post("/api/invites/accept")
      .send({ token, name: "سارة", password: "short" })
      .expect(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    await request(app.getHttpServer()).get(`/api/invites/accept/${token}`).expect(200); // still usable
  });

  it("making and listing invites needs a login", async () => {
    await request(app.getHttpServer())
      .post("/api/invites")
      .send({ email: `n@${RUN}.test`, role: "EDITOR" })
      .expect(401);
    await request(app.getHttpServer()).get("/api/invites").expect(401);
  });
});
