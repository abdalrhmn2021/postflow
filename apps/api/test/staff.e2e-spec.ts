import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { startApp, uniqueRun } from "./app.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";

type Agent = ReturnType<typeof request.agent>;

describe("staff", () => {
  let app: INestApplication<App>;
  let ownerA: Agent, ownerB: Agent;
  let ownerAId: string;

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
    return { agent, userId: res.body.user.id as string };
  }

  // Staff join agency A the real way: the owner invites them and they accept the link.
  async function addStaff(role: "MANAGER" | "EDITOR", name: string) {
    const email = `${name.toLowerCase()}@a.${RUN}.test`;
    const inv = await ownerA.post("/api/invites").send({ email, role }).expect(201);
    const token = (inv.body.link as string).split("/invite/")[1];
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post("/api/invites/accept").send({ token, name, password: PASSWORD }).expect(201);
    return { agent, id: res.body.user.id as string };
  }

  beforeAll(async () => {
    app = await startApp();
    const a = await registerOwner("a");
    ownerA = a.agent;
    ownerAId = a.userId;
    ownerB = (await registerOwner("b")).agent;
  });

  afterAll(async () => {
    await app?.get(PrismaService).agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await app?.close();
  });

  it("the owner and a manager see the team with each editor's brands; an editor may not", async () => {
    const manager = await addStaff("MANAGER", "Mona");
    const editor = await addStaff("EDITOR", "Eyad");
    const brand = await ownerA.post("/api/brands").send({ name: "Burger" }).expect(201);
    await ownerA
      .put(`/api/brands/${brand.body.id}/editors`)
      .send({ userIds: [editor.id] })
      .expect(200);

    for (const agent of [ownerA, manager.agent]) {
      const res = await agent.get("/api/staff").expect(200);
      expect(res.body.map((s: { role: string }) => s.role)).toEqual(["OWNER", "MANAGER", "EDITOR"]);
      const eyad = res.body.find((s: { id: string }) => s.id === editor.id);
      expect(eyad).toMatchObject({ name: "Eyad", role: "EDITOR", brands: [{ id: brand.body.id, name: "Burger" }] });
      expect(eyad.passwordHash).toBeUndefined();
    }
    await editor.agent.get("/api/staff").expect(403);

    // Clean up for the next tests, which count the team.
    await ownerA.delete(`/api/staff/${manager.id}`).expect(204);
    await ownerA.delete(`/api/staff/${editor.id}`).expect(204);
  });

  it("changing a role applies at once and clears that person's brands", async () => {
    const editor = await addStaff("EDITOR", "Sara");
    const brand = await ownerA.post("/api/brands").send({ name: "Cafe" }).expect(201);
    await ownerA
      .put(`/api/brands/${brand.body.id}/editors`)
      .send({ userIds: [editor.id] })
      .expect(200);

    const res = await ownerA.patch(`/api/staff/${editor.id}`).send({ role: "MANAGER" }).expect(200);
    expect(res.body).toMatchObject({ id: editor.id, role: "MANAGER", brands: [] });

    // Same cookie, new role: no new login needed.
    expect((await editor.agent.get("/api/auth/me").expect(200)).body.user.role).toBe("MANAGER");
    const cafe = await ownerA.get(`/api/brands/${brand.body.id}`).expect(200);
    expect(cafe.body.editors).toEqual([]);

    // The same role again changes nothing and is fine.
    await ownerA.patch(`/api/staff/${editor.id}`).send({ role: "MANAGER" }).expect(200);
  });

  it("only the owner changes the team", async () => {
    const manager = await addStaff("MANAGER", "Omar");
    const editor = await addStaff("EDITOR", "Lina");
    await manager.agent.patch(`/api/staff/${editor.id}`).send({ role: "MANAGER" }).expect(403);
    await manager.agent.delete(`/api/staff/${editor.id}`).expect(403);
    await editor.agent.delete(`/api/staff/${manager.id}`).expect(403);
  });

  it("nobody can change or remove the owner, and the owner role can't be given", async () => {
    const own = await ownerA.patch(`/api/staff/${ownerAId}`).send({ role: "EDITOR" }).expect(400);
    expect(own.body.code).toBe("CANNOT_CHANGE_OWNER");
    expect((await ownerA.delete(`/api/staff/${ownerAId}`).expect(400)).body.code).toBe("CANNOT_CHANGE_OWNER");

    const editor = await addStaff("EDITOR", "Hadi");
    const res = await ownerA.patch(`/api/staff/${editor.id}`).send({ role: "OWNER" }).expect(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("another agency can't see, change or remove our staff: always 404", async () => {
    const editor = await addStaff("EDITOR", "Rami");
    const listB = await ownerB.get("/api/staff").expect(200);
    expect(listB.body).toHaveLength(1); // only B's own owner
    expect(listB.body.some((s: { id: string }) => s.id === editor.id)).toBe(false);

    const patch = await ownerB.patch(`/api/staff/${editor.id}`).send({ role: "MANAGER" }).expect(404);
    expect(patch.body.code).toBe("STAFF_NOT_FOUND");
    await ownerB.delete(`/api/staff/${editor.id}`).expect(404);
    await ownerB.delete(`/api/staff/${ownerAId}`).expect(404); // not even "can't change owner": it's not theirs

    // Still there, still an editor.
    const listA = await ownerA.get("/api/staff").expect(200);
    expect(listA.body.find((s: { id: string }) => s.id === editor.id).role).toBe("EDITOR");
  });

  it("a removed person is logged out at once and leaves the list", async () => {
    const editor = await addStaff("EDITOR", "Noor");
    await editor.agent.get("/api/auth/me").expect(200);

    await ownerA.delete(`/api/staff/${editor.id}`).expect(204);
    await editor.agent.get("/api/auth/me").expect(401); // same cookie, no longer works
    const list = await ownerA.get("/api/staff").expect(200);
    expect(list.body.some((s: { id: string }) => s.id === editor.id)).toBe(false);
    await ownerA.delete(`/api/staff/${editor.id}`).expect(404);
  });

  it("needs a login", async () => {
    await request(app.getHttpServer()).get("/api/staff").expect(401);
    await request(app.getHttpServer()).delete(`/api/staff/${ownerAId}`).expect(401);
  });
});
