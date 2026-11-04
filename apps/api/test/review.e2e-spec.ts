import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { hashPassword } from "../src/auth/password.js";
import { Role } from "../src/generated/prisma/client.js";
import { MediaStorage } from "../src/media/media-storage.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { RedisService } from "../src/redis/redis.service.js";
import { startApp, uniqueRun } from "./app.js";
import { FakeMediaStorage } from "./fake-media-storage.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

type Agent = ReturnType<typeof request.agent>;

describe("client approval", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let owner: Agent, editor: Agent, ownerB: Agent;
  let client: ReturnType<typeof request>; // the client: no account, no cookie
  let brandId: string, otherBrandId: string;
  let token: string;
  const ips: string[] = [];

  async function register(slug: string) {
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

  const draft = async (caption = "عرض الجمعة 🍔") =>
    (
      await editor
        .post("/api/posts")
        .send({ brandId, caption, platforms: ["FACEBOOK"], scheduledAt: inHours(5) })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    app = await startApp((b) => b.overrideProvider(MediaStorage).useValue(new FakeMediaStorage()));
    prisma = app.get(PrismaService);
    client = request(app.getHttpServer());

    const a = await register("a");
    owner = a.agent;
    brandId = (await owner.post("/api/brands").send({ name: "Burger", requiresApproval: true }).expect(201)).body.id;
    otherBrandId = (await owner.post("/api/brands").send({ name: "Coffee" }).expect(201)).body.id;

    const email = `editor@a.${RUN}.test`;
    const user = await prisma.user.create({
      data: { agencyId: a.agencyId, role: Role.EDITOR, email, name: "E", passwordHash: await hashPassword(PASSWORD) },
    });
    await owner
      .put(`/api/brands/${brandId}/editors`)
      .send({ userIds: [user.id] })
      .expect(200);
    editor = request.agent(app.getHttpServer());
    ips.push("198.51.100.221");
    await editor.post("/api/auth/login").set("X-Forwarded-For", ips[0]).send({ email, password: PASSWORD }).expect(200);

    ownerB = (await register("b")).agent;
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await Promise.all(ips.map((ip) => app?.get(RedisService).client.del(`login-attempts:${ip}`)));
    await app?.close();
  });

  it("the brand says whether its posts need the client's approval", async () => {
    expect((await owner.get(`/api/brands/${brandId}`).expect(200)).body.requiresApproval).toBe(true);
    expect((await owner.get(`/api/brands/${otherBrandId}`).expect(200)).body.requiresApproval).toBe(false);
  });

  let postId: string;

  it("a post of such a brand can't be scheduled before the client approves it", async () => {
    postId = await draft();
    const res = await owner.post(`/api/posts/${postId}/schedule`).expect(400);
    expect(res.body.fields).toEqual({ approval: "The client hasn't approved this post" });
  });

  it("only the owner or a manager makes a review link; an editor sends posts for approval", async () => {
    await editor.post(`/api/brands/${brandId}/review-link`).expect(403);
    await ownerB.post(`/api/brands/${brandId}/review-link`).expect(404);
    const res = await owner.post(`/api/brands/${brandId}/review-link?lang=en`).expect(201);
    expect(res.body.link).toMatch(/\/en\/review\/[\w-]{43}$/);
    token = res.body.link.split("/review/")[1];

    const sent = await editor.post(`/api/posts/${postId}/approval`).expect(200);
    expect(sent.body).toMatchObject({ approval: "PENDING", approvalNote: null });
  });

  it("the client opens the link without an account and sees what's waiting - nothing internal", async () => {
    await draft("not sent to the client"); // NONE: not on the link
    const res = await client.get(`/api/review/${token}`).expect(200);
    expect(res.body.brand).toMatchObject({ name: "Burger", agency: { name: "Agency a" } });
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0]).toMatchObject({ id: postId, caption: "عرض الجمعة 🍔", approval: "PENDING" });
    expect(res.body.posts[0].createdBy).toBeUndefined();

    await client.get("/api/review/made-up-token").expect(404);
  });

  it("asking for changes needs a note; the agency sees it", async () => {
    const bad = await client.post(`/api/review/${token}/posts/${postId}`).send({ decision: "CHANGES" }).expect(400);
    expect(bad.body.fields.note).toBe("Tell the agency what to change");

    await client
      .post(`/api/review/${token}/posts/${postId}`)
      .send({ decision: "CHANGES", note: "غيّروا السعر لـ 25 شيكل" })
      .expect(200);
    const post = (await editor.get(`/api/posts/${postId}`).expect(200)).body;
    expect(post).toMatchObject({ approval: "CHANGES_REQUESTED", approvalNote: "غيّروا السعر لـ 25 شيكل" });

    // Answered: the same link can't answer it again until the agency sends it again.
    const again = await client.post(`/api/review/${token}/posts/${postId}`).send({ decision: "APPROVE" }).expect(409);
    expect(again.body.code).toBe("REVIEW_DONE");
  });

  it("fixed and sent again, the client approves, and it can be scheduled", async () => {
    await editor.patch(`/api/posts/${postId}`).send({ caption: "عرض الجمعة 🍔 بـ 25 شيكل" }).expect(200);
    await editor.post(`/api/posts/${postId}/approval`).expect(200);
    const approved = await client
      .post(`/api/review/${token}/posts/${postId}`)
      .send({ decision: "APPROVE" })
      .expect(200);
    expect(approved.body).toMatchObject({ approval: "APPROVED", caption: "عرض الجمعة 🍔 بـ 25 شيكل" });

    await owner.post(`/api/posts/${postId}/schedule`).expect(200);
  });

  it("changing the text after approval needs a new approval - a scheduled post refuses the change", async () => {
    const res = await owner.patch(`/api/posts/${postId}`).send({ caption: "سعر ثاني" }).expect(400);
    expect(res.body.fields.approval).toBe("The client hasn't approved this post");
    // The time alone isn't the content: it can move.
    await owner
      .patch(`/api/posts/${postId}`)
      .send({ scheduledAt: inHours(6) })
      .expect(200);

    await owner.post(`/api/posts/${postId}/unschedule`).expect(200);
    const changed = await owner.patch(`/api/posts/${postId}`).send({ caption: "سعر ثاني" }).expect(200);
    expect(changed.body.approval).toBe("NONE");
  });

  it("a post that's already out (or going out) can't be answered any more", async () => {
    const id = await draft("نزل قبل ما العميل يرد");
    await editor.post(`/api/posts/${id}/approval`).expect(200);
    for (const status of ["PUBLISHING", "PUBLISHED"] as const) {
      await prisma.post.update({ where: { id }, data: { status } }); // as the worker would
      const res = await client.post(`/api/review/${token}/posts/${id}`).send({ decision: "APPROVE" }).expect(409);
      expect(res.body.code).toBe("REVIEW_DONE");
    }
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).approval).toBe("PENDING"); // unchanged
  });

  it("a link reaches its own brand only, and can be stopped", async () => {
    const coffeePost = (await owner.post("/api/posts").send({ brandId: otherBrandId, caption: "x" }).expect(201)).body
      .id;
    await owner.post(`/api/posts/${coffeePost}/approval`).expect(200);
    await client.post(`/api/review/${token}/posts/${coffeePost}`).send({ decision: "APPROVE" }).expect(404);

    await editor.delete(`/api/brands/${brandId}/review-link`).expect(403);
    await owner.delete(`/api/brands/${brandId}/review-link`).expect(204);
    expect((await client.get(`/api/review/${token}`).expect(404)).body.code).toBe("REVIEW_LINK_INVALID");
  });

  it("an expired link doesn't work", async () => {
    const link = (await owner.post(`/api/brands/${brandId}/review-link`).expect(201)).body.link as string;
    await prisma.reviewLink.updateMany({ where: { brandId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await client.get(`/api/review/${link.split("/review/")[1]}`).expect(404);
  });
});
