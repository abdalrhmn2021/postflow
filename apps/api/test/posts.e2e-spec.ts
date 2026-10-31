import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { hashPassword } from "../src/auth/password.js";
import { PostStatus, Role } from "../src/generated/prisma/client.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { RedisService } from "../src/redis/redis.service.js";
import { startApp, uniqueRun } from "./app.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";
const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

type Agent = ReturnType<typeof request.agent>;

describe("posts", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const ips: string[] = [];

  // Agency A: owner, manager, an editor on the burger brand only. Agency B: an owner.
  let ownerA: Agent, managerA: Agent, editorA: Agent, ownerB: Agent;
  let editorAId: string;
  let burgerId: string, coffeeId: string;

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

  async function addStaff(agencyId: string, role: Role, email: string) {
    const user = await prisma.user.create({
      data: { agencyId, role, email, name: role, passwordHash: await hashPassword(PASSWORD) },
    });
    const agent = request.agent(app.getHttpServer());
    const ip = `198.51.100.${100 + ips.length}`; // own IP per login, apart from the login limit
    ips.push(ip);
    await agent.post("/api/auth/login").set("X-Forwarded-For", ip).send({ email, password: PASSWORD }).expect(200);
    return { agent, userId: user.id };
  }

  beforeAll(async () => {
    app = await startApp();
    prisma = app.get(PrismaService);

    const a = await registerOwner("a");
    ownerA = a.agent;
    ({ agent: managerA } = await addStaff(a.agencyId, Role.MANAGER, `manager@a.${RUN}.test`));
    ({ agent: editorA, userId: editorAId } = await addStaff(a.agencyId, Role.EDITOR, `editor@a.${RUN}.test`));

    burgerId = (await ownerA.post("/api/brands").send({ name: "برجر هم" }).expect(201)).body.id;
    coffeeId = (await ownerA.post("/api/brands").send({ name: "Coffee" }).expect(201)).body.id;
    await ownerA
      .put(`/api/brands/${burgerId}/editors`)
      .send({ userIds: [editorAId] })
      .expect(200);

    ownerB = (await registerOwner("b")).agent;
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } }); // brands and posts go with them
    await Promise.all(ips.map((ip) => app?.get(RedisService).client.del(`login-attempts:${ip}`)));
    await app?.close();
  });

  let postId: string;

  it("an editor drafts a post for their brand; it starts as a signed draft", async () => {
    const res = await editorA.post("/api/posts").send({ brandId: burgerId, caption: "عرض الجمعة" }).expect(201);
    expect(res.body).toMatchObject({
      caption: "عرض الجمعة",
      platforms: [],
      status: "DRAFT",
      scheduledAt: null,
      brand: { id: burgerId, name: "برجر هم", timezone: "Asia/Hebron" },
      createdBy: { id: editorAId },
    });
    postId = res.body.id;
  });

  it("an editor can't draft for a brand they aren't on, and nobody for another agency's brand", async () => {
    const res = await editorA.post("/api/posts").send({ brandId: coffeeId }).expect(404);
    expect(res.body.code).toBe("BRAND_NOT_FOUND");
    await ownerB.post("/api/posts").send({ brandId: burgerId }).expect(404);
  });

  it("a status sent with a new post is ignored: it is always a draft", async () => {
    const res = await managerA
      .post("/api/posts")
      .send({ brandId: coffeeId, status: "PUBLISHED", platforms: ["FACEBOOK"], scheduledAt: inHours(5) })
      .expect(201);
    expect(res.body.status).toBe("DRAFT");
  });

  it("an editor can't schedule; a manager can't schedule an incomplete post", async () => {
    expect((await editorA.post(`/api/posts/${postId}/schedule`).expect(403)).body.code).toBe("FORBIDDEN");

    const res = await managerA.post(`/api/posts/${postId}/schedule`).expect(400);
    expect(res.body).toMatchObject({
      code: "POST_NOT_READY",
      fields: { platforms: "Pick at least one platform", scheduledAt: "Pick a time" },
    });

    await editorA
      .patch(`/api/posts/${postId}`)
      .send({ scheduledAt: inHours(-1) })
      .expect(200); // a draft may
    expect((await managerA.post(`/api/posts/${postId}/schedule`).expect(400)).body.fields.scheduledAt).toBe(
      "The time has already passed",
    );
  });

  it("the editor completes the draft and the manager schedules it", async () => {
    const at = inHours(24);
    const draft = await editorA
      .patch(`/api/posts/${postId}`)
      .send({ platforms: ["FACEBOOK", "INSTAGRAM"], scheduledAt: at })
      .expect(200);
    expect(draft.body).toMatchObject({ caption: "عرض الجمعة", platforms: ["FACEBOOK", "INSTAGRAM"] });

    const res = await managerA.post(`/api/posts/${postId}/schedule`).expect(200);
    expect(res.body).toMatchObject({ status: "SCHEDULED", scheduledAt: at });
    await managerA.post(`/api/posts/${postId}/schedule`).expect(200); // twice is fine
  });

  it("a scheduled post: the editor can still see it but not change or delete it", async () => {
    await editorA.get(`/api/posts/${postId}`).expect(200);
    await editorA.patch(`/api/posts/${postId}`).send({ caption: "x" }).expect(403);
    await editorA.delete(`/api/posts/${postId}`).expect(403);
  });

  it("a manager's change to a scheduled post must keep it ready", async () => {
    const bad = await managerA.patch(`/api/posts/${postId}`).send({ platforms: [] }).expect(400);
    expect(bad.body.code).toBe("POST_NOT_READY");
    const tooMany = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    await managerA.patch(`/api/posts/${postId}`).send({ caption: tooMany }).expect(400); // Instagram is on it

    const ok = await managerA.patch(`/api/posts/${postId}`).send({ caption: "عرض الجمعة 🍔 #برجر" }).expect(200);
    expect(ok.body).toMatchObject({ status: "SCHEDULED", caption: "عرض الجمعة 🍔 #برجر" });
  });

  it("the calendar lists posts in the range; an editor sees only their brands' posts", async () => {
    const range = { from: inHours(0), to: inHours(48) };

    const all = await managerA.get("/api/posts").query(range).expect(200);
    expect(all.body.map((p: { brand: { name: string } }) => p.brand.name)).toEqual(["Coffee", "برجر هم"]); // 5 h, 24 h

    const coffeeOnly = await managerA
      .get("/api/posts")
      .query({ ...range, brandId: coffeeId })
      .expect(200);
    expect(coffeeOnly.body).toHaveLength(1);

    const editors = await editorA.get("/api/posts").query(range).expect(200);
    expect(editors.body.map((p: { id: string }) => p.id)).toEqual([postId]);
    expect(
      (
        await editorA
          .get("/api/posts")
          .query({ ...range, brandId: coffeeId })
          .expect(200)
      ).body,
    ).toEqual([]);

    const later = await managerA
      .get("/api/posts")
      .query({ from: inHours(30), to: inHours(48) })
      .expect(200);
    expect(later.body).toEqual([]);
  });

  it("the calendar range is checked", async () => {
    const res = await managerA
      .get("/api/posts")
      .query({ from: inHours(0), to: inHours(24 * 70) })
      .expect(400);
    expect(res.body).toMatchObject({ code: "VALIDATION_ERROR", fields: { to: "At most 62 days at a time" } });
    await managerA.get("/api/posts").expect(400); // no range at all
  });

  it("drafts with no time are listed apart", async () => {
    const draft = await editorA.post("/api/posts").send({ brandId: burgerId, caption: "فكرة" }).expect(201);
    const res = await editorA.get("/api/posts/unscheduled").expect(200);
    expect(res.body.map((p: { id: string }) => p.id)).toEqual([draft.body.id]);
    await editorA.delete(`/api/posts/${draft.body.id}`).expect(204); // an editor deletes a draft
    await editorA.get(`/api/posts/${draft.body.id}`).expect(404);
  });

  it("another agency can't see, change, schedule or delete a post: always 404", async () => {
    expect(
      (
        await ownerB
          .get("/api/posts")
          .query({ from: inHours(0), to: inHours(48) })
          .expect(200)
      ).body,
    ).toEqual([]);
    expect((await ownerB.get(`/api/posts/${postId}`).expect(404)).body.code).toBe("POST_NOT_FOUND");
    await ownerB.patch(`/api/posts/${postId}`).send({ caption: "Hacked" }).expect(404);
    await ownerB.post(`/api/posts/${postId}/unschedule`).expect(404);
    await ownerB.delete(`/api/posts/${postId}`).expect(404);
    expect((await ownerA.get(`/api/posts/${postId}`).expect(200)).body.status).toBe("SCHEDULED");
  });

  it("unscheduling makes it a draft again, everything else kept", async () => {
    const res = await managerA.post(`/api/posts/${postId}/unschedule`).expect(200);
    expect(res.body).toMatchObject({ status: "DRAFT", platforms: ["FACEBOOK", "INSTAGRAM"] });
    expect(res.body.scheduledAt).not.toBeNull();
  });

  it("a failed post becomes a draft once someone fixes it", async () => {
    await prisma.post.update({ where: { id: postId }, data: { status: PostStatus.FAILED } }); // as the worker will
    await editorA.patch(`/api/posts/${postId}`).send({ caption: "x" }).expect(403); // past draft: not an editor's
    const res = await managerA.patch(`/api/posts/${postId}`).send({ caption: "عرض الجمعة - مصحح" }).expect(200);
    expect(res.body.status).toBe("DRAFT");
  });

  it("a published post can't be changed, rescheduled, unscheduled or deleted - by anyone", async () => {
    await prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.PUBLISHED, publishedAt: new Date() },
    });
    for (const res of [
      await ownerA.patch(`/api/posts/${postId}`).send({ caption: "x" }),
      await ownerA.post(`/api/posts/${postId}/schedule`),
      await ownerA.post(`/api/posts/${postId}/unschedule`),
      await ownerA.delete(`/api/posts/${postId}`),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("POST_PUBLISHED");
    }
  });

  it("removing a staff member keeps their posts, unsigned", async () => {
    await prisma.user.delete({ where: { id: editorAId } });
    expect((await ownerA.get(`/api/posts/${postId}`).expect(200)).body.createdBy).toBeNull();
  });

  it("deleting a brand deletes its posts", async () => {
    await ownerA.delete(`/api/brands/${burgerId}`).expect(204);
    expect(await prisma.post.count({ where: { brandId: burgerId } })).toBe(0);
  });
});
