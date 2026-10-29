import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { hashPassword } from "../src/auth/password.js";
import { Role } from "../src/generated/prisma/client.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { RedisService } from "../src/redis/redis.service.js";
import { startApp, uniqueRun } from "./app.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";

type Agent = ReturnType<typeof request.agent>;

describe("brands", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const ips: string[] = [];

  // Two agencies. Agency A has an owner, a manager and two editors; agency B only an owner.
  let ownerA: Agent, managerA: Agent, editorA: Agent, ownerB: Agent;
  let editorAId: string, editor2AId: string, managerAId: string, ownerBId: string;

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
    return { agent, agencyId: res.body.agency.id as string, userId: res.body.user.id as string };
  }

  // Staff are added straight to the database here; inviting them through the API is the next step.
  async function addStaff(agencyId: string, role: Role, email: string) {
    const user = await prisma.user.create({
      data: { agencyId, role, email, name: role, passwordHash: await hashPassword(PASSWORD) },
    });
    const agent = request.agent(app.getHttpServer());
    const ip = `198.51.100.${ips.length + 1}`; // own IP per login, apart from the login limit
    ips.push(ip);
    await agent.post("/api/auth/login").set("X-Forwarded-For", ip).send({ email, password: PASSWORD }).expect(200);
    return { agent, userId: user.id };
  }

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);

    const a = await registerOwner("a");
    ownerA = a.agent;
    ({ agent: managerA, userId: managerAId } = await addStaff(a.agencyId, Role.MANAGER, `manager@a.${RUN}.test`));
    ({ agent: editorA, userId: editorAId } = await addStaff(a.agencyId, Role.EDITOR, `editor@a.${RUN}.test`));
    ({ userId: editor2AId } = await addStaff(a.agencyId, Role.EDITOR, `editor2@a.${RUN}.test`));

    const b = await registerOwner("b");
    ownerB = b.agent;
    ownerBId = b.userId;
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await Promise.all(ips.map((ip) => app?.get(RedisService).client.del(`login-attempts:${ip}`)));
    await app?.close();
  });

  let burgerId: string;

  it("the owner adds a brand; the defaults fill in", async () => {
    const res = await ownerA.post("/api/brands").send({ name: "برجر هم", voice: "شبابي ومرح" }).expect(201);
    expect(res.body).toMatchObject({ name: "برجر هم", language: "ar", timezone: "Asia/Hebron", editors: [] });
    burgerId = res.body.id;
  });

  it("refuses the same brand name twice in one agency, but not in another agency", async () => {
    const dup = await ownerA.post("/api/brands").send({ name: "برجر هم" }).expect(409);
    expect(dup.body.code).toBe("BRAND_NAME_TAKEN");
    await ownerB.post("/api/brands").send({ name: "برجر هم" }).expect(201);
  });

  it("only the owner may add, change or delete brands", async () => {
    for (const agent of [managerA, editorA]) {
      expect((await agent.post("/api/brands").send({ name: "Nope" }).expect(403)).body.code).toBe("FORBIDDEN");
      await agent.patch(`/api/brands/${burgerId}`).send({ name: "Nope" }).expect(403);
      await agent.delete(`/api/brands/${burgerId}`).expect(403);
    }
  });

  it("the manager sees every brand; an editor sees only the brands they're on", async () => {
    await ownerA.post("/api/brands").send({ name: "Coffee", language: "en" }).expect(201);

    const managerList = await managerA.get("/api/brands").expect(200);
    expect(managerList.body.map((b: { name: string }) => b.name)).toEqual(["Coffee", "برجر هم"]);

    expect((await editorA.get("/api/brands").expect(200)).body).toEqual([]);
    await editorA.get(`/api/brands/${burgerId}`).expect(404);

    await ownerA
      .put(`/api/brands/${burgerId}/editors`)
      .send({ userIds: [editorAId] })
      .expect(200);

    const editorList = await editorA.get("/api/brands").expect(200);
    expect(editorList.body.map((b: { name: string }) => b.name)).toEqual(["برجر هم"]);
    await editorA.get(`/api/brands/${burgerId}`).expect(200);
  });

  it("replaces the editor list, and accepts only editors of the same agency", async () => {
    const res = await ownerA
      .put(`/api/brands/${burgerId}/editors`)
      .send({ userIds: [editor2AId] })
      .expect(200);
    expect(res.body.editors.map((e: { id: string }) => e.id)).toEqual([editor2AId]);
    await editorA.get(`/api/brands/${burgerId}`).expect(404); // taken off the brand

    for (const userIds of [[managerAId], [ownerBId], ["no-such-user"]]) {
      const bad = await ownerA.put(`/api/brands/${burgerId}/editors`).send({ userIds }).expect(400);
      expect(bad.body.code).toBe("INVALID_EDITORS");
    }
    // A refused change leaves the list as it was.
    const after = await ownerA.get(`/api/brands/${burgerId}`).expect(200);
    expect(after.body.editors.map((e: { id: string }) => e.id)).toEqual([editor2AId]);
  });

  it("another agency can't see, change, delete or staff a brand: always 404", async () => {
    expect((await ownerB.get("/api/brands").expect(200)).body.map((b: { name: string }) => b.name)).toEqual([
      "برجر هم", // B's own brand with the same name, not A's
    ]);
    const res = await ownerB.get(`/api/brands/${burgerId}`).expect(404);
    expect(res.body.code).toBe("BRAND_NOT_FOUND");
    await ownerB.patch(`/api/brands/${burgerId}`).send({ name: "Hacked" }).expect(404);
    await ownerB.put(`/api/brands/${burgerId}/editors`).send({ userIds: [] }).expect(404);
    await ownerB.delete(`/api/brands/${burgerId}`).expect(404);

    expect((await ownerA.get(`/api/brands/${burgerId}`).expect(200)).body.name).toBe("برجر هم");
  });

  it("the owner changes only the fields sent, then deletes the brand", async () => {
    const res = await ownerA
      .patch(`/api/brands/${burgerId}`)
      .send({ timezone: "Europe/London", voice: "" })
      .expect(200);
    expect(res.body).toMatchObject({ name: "برجر هم", timezone: "Europe/London", voice: null });

    const bad = await ownerA.patch(`/api/brands/${burgerId}`).send({ timezone: "Asia/Hebronn" }).expect(400);
    expect(bad.body.fields).toHaveProperty("timezone");

    await ownerA.delete(`/api/brands/${burgerId}`).expect(204);
    await ownerA.get(`/api/brands/${burgerId}`).expect(404);
    // The editor assignments went with it (onDelete: Cascade).
    expect(await prisma.brandMember.count({ where: { brandId: burgerId } })).toBe(0);
  });

  it("needs a login", async () => {
    await request(app.getHttpServer()).get("/api/brands").expect(401);
  });
});
