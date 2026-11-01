import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { hashPassword } from "../src/auth/password.js";
import { MediaType, PostStatus, Role } from "../src/generated/prisma/client.js";
import { MediaStorage } from "../src/media/media-storage.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { RedisService } from "../src/redis/redis.service.js";
import { startApp, uniqueRun } from "./app.js";
import { FakeMediaStorage } from "./fake-media-storage.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";
const inHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

type Agent = ReturnType<typeof request.agent>;
type Media = { id: string; type: string; width: number; height: number; publicId: string };

describe("post files (images and videos)", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const storage = new FakeMediaStorage();
  const ips: string[] = [];

  let owner: Agent, editor: Agent, ownerB: Agent;
  let burgerId: string, coffeeId: string;

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

  // Ticket -> "upload" (the fake store) -> attach, expecting `status`. Returns the API's answer.
  async function addFile(
    agent: Agent,
    postId: string,
    file: Parameters<FakeMediaStorage["upload"]>[1] = {},
    status = 200,
  ) {
    const { publicId } = (await agent.post(`/api/posts/${postId}/media/upload`).expect(200)).body;
    storage.upload(publicId, file);
    return agent
      .post(`/api/posts/${postId}/media`)
      .send({ publicId, type: file.type ?? MediaType.IMAGE })
      .expect(status);
  }

  const newPost = async (agent: Agent, brandId: string, extra: object = {}) =>
    (
      await agent
        .post("/api/posts")
        .send({ brandId, caption: "عرض", ...extra })
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    app = await startApp((b) => b.overrideProvider(MediaStorage).useValue(storage));
    prisma = app.get(PrismaService);

    const a = await register("a");
    owner = a.agent;
    burgerId = (await owner.post("/api/brands").send({ name: "Burger" }).expect(201)).body.id;
    coffeeId = (await owner.post("/api/brands").send({ name: "Coffee" }).expect(201)).body.id;

    const editorUser = await prisma.user.create({
      data: {
        agencyId: a.agencyId,
        role: Role.EDITOR,
        email: `editor@a.${RUN}.test`,
        name: "Editor",
        passwordHash: await hashPassword(PASSWORD),
      },
    });
    await owner
      .put(`/api/brands/${burgerId}/editors`)
      .send({ userIds: [editorUser.id] })
      .expect(200);
    editor = request.agent(app.getHttpServer());
    const ip = "198.51.100.201";
    ips.push(ip);
    await editor
      .post("/api/auth/login")
      .set("X-Forwarded-For", ip)
      .send({ email: editorUser.email, password: PASSWORD })
      .expect(200);

    ownerB = (await register("b")).agent;
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await Promise.all(ips.map((ip) => app?.get(RedisService).client.del(`login-attempts:${ip}`)));
    await app?.close();
  });

  it("the ticket is for one new name inside the brand's folder", async () => {
    const postId = await newPost(editor, burgerId);
    const one = (await editor.post(`/api/posts/${postId}/media/upload`).expect(200)).body;
    const two = (await editor.post(`/api/posts/${postId}/media/upload`).expect(200)).body;
    expect(one.publicId).toMatch(new RegExp(`^postflow/[\\w-]+/${burgerId}/[\\w-]+$`));
    expect(one.publicId).not.toBe(two.publicId);
    expect(one).toMatchObject({ url: expect.any(String), fields: { public_id: one.publicId } });
  });

  it("the file's details come from the store, not from the browser", async () => {
    const postId = await newPost(editor, burgerId);
    const res = await addFile(editor, postId, { width: 1080, height: 1350 });
    expect(res.body.media).toEqual([
      expect.objectContaining({ type: "IMAGE", width: 1080, height: 1350, format: "jpg", url: expect.any(String) }),
    ]);

    // Extra fields in the body (a made-up size) are simply not read.
    const { publicId } = (await editor.post(`/api/posts/${postId}/media/upload`).expect(200)).body;
    storage.upload(publicId, { width: 1080, height: 1920 });
    const lie = await editor
      .post(`/api/posts/${postId}/media`)
      .send({ publicId, type: "IMAGE", width: 1080, height: 1080 })
      .expect(200);
    expect(lie.body.media[1]).toMatchObject({ width: 1080, height: 1920 });
  });

  it("a file that was never uploaded, of the wrong kind, or of another brand: 404", async () => {
    const postId = await newPost(owner, burgerId);
    const { publicId } = (await owner.post(`/api/posts/${postId}/media/upload`).expect(200)).body;
    const missing = await owner.post(`/api/posts/${postId}/media`).send({ publicId, type: "IMAGE" }).expect(404);
    expect(missing.body.code).toBe("MEDIA_NOT_FOUND");

    storage.upload(publicId); // an image
    await owner.post(`/api/posts/${postId}/media`).send({ publicId, type: "VIDEO" }).expect(404);

    // A ticket for a Coffee post, used on a Burger post.
    const coffeePost = await newPost(owner, coffeeId);
    const coffeeFile = (await owner.post(`/api/posts/${coffeePost}/media/upload`).expect(200)).body.publicId;
    storage.upload(coffeeFile);
    await owner.post(`/api/posts/${postId}/media`).send({ publicId: coffeeFile, type: "IMAGE" }).expect(404);
    await owner.post(`/api/posts/${postId}/media`).send({ publicId: "postflow/x/y/z", type: "IMAGE" }).expect(404);
    await owner.post(`/api/posts/${postId}/media`).send({ publicId, type: "GIF" }).expect(400);
  });

  it("a file in the wrong format or too big is refused, and deleted from the store", async () => {
    const postId = await newPost(editor, burgerId);
    const gif = await addFile(editor, postId, { format: "gif" }, 400);
    expect(gif.body).toMatchObject({ code: "VALIDATION_ERROR", fields: { file: "Must be jpg, jpeg, png, webp" } });
    expect(storage.files.has(storage.removed.at(-1)!)).toBe(false);

    const big = await addFile(editor, postId, { type: MediaType.VIDEO, bytes: 200 * 1024 * 1024 }, 400);
    expect(big.body.fields.file).toBe("At most 100 MB");
  });

  it("attaching the same file twice adds it once; a post holds at most 10", async () => {
    const postId = await newPost(editor, burgerId);
    const { publicId } = (await editor.post(`/api/posts/${postId}/media/upload`).expect(200)).body;
    storage.upload(publicId);
    await editor.post(`/api/posts/${postId}/media`).send({ publicId, type: "IMAGE" }).expect(200);
    const again = await editor.post(`/api/posts/${postId}/media`).send({ publicId, type: "IMAGE" }).expect(200);
    expect(again.body.media).toHaveLength(1);

    for (let i = 1; i < 10; i++) await addFile(editor, postId);
    const full = await editor.post(`/api/posts/${postId}/media/upload`).expect(400);
    expect(full.body.code).toBe("MEDIA_LIMIT");
  });

  it("files can be put in a new order, and removed - from the post and the store", async () => {
    const postId = await newPost(editor, burgerId);
    await addFile(editor, postId);
    await addFile(editor, postId, { type: MediaType.VIDEO });
    const three = (await addFile(editor, postId)).body.media as Media[];
    const [a, b, c] = three.map((m) => m.id);

    const ordered = await editor
      .put(`/api/posts/${postId}/media/order`)
      .send({ ids: [c, a, b] })
      .expect(200);
    expect(ordered.body.media.map((m: Media) => m.id)).toEqual([c, a, b]);

    for (const ids of [
      [a, b],
      [a, b, c, c],
      [a, b, "other"],
    ]) {
      const bad = await editor.put(`/api/posts/${postId}/media/order`).send({ ids }).expect(400);
      expect(bad.body.code).toBe("VALIDATION_ERROR");
    }

    const removed = await editor.delete(`/api/posts/${postId}/media/${a}`).expect(200);
    expect(removed.body.media.map((m: Media) => m.id)).toEqual([c, b]);
    expect(storage.removed).toContain(three[0].publicId);
    expect(await prisma.postMedia.findMany({ where: { postId }, orderBy: { position: "asc" } })).toMatchObject([
      { id: c, position: 0 },
      { id: b, position: 1 },
    ]);
    await editor.delete(`/api/posts/${postId}/media/${a}`).expect(404);
  });

  it("a scheduled post's files: not the editor's; a manager's change must keep it ready", async () => {
    const postId = await newPost(owner, burgerId, { platforms: ["INSTAGRAM"], scheduledAt: inHours(5) });
    const image = (await addFile(owner, postId)).body.media[0] as Media;
    await owner.post(`/api/posts/${postId}/schedule`).expect(200);

    await editor.post(`/api/posts/${postId}/media/upload`).expect(403);
    await editor.delete(`/api/posts/${postId}/media/${image.id}`).expect(403);

    const last = await owner.delete(`/api/posts/${postId}/media/${image.id}`).expect(400);
    expect(last.body).toMatchObject({
      code: "POST_NOT_READY",
      fields: { media: "Instagram needs an image or a video" },
    });

    const story = await addFile(owner, postId, { width: 1080, height: 1920 }, 400);
    expect(story.body.fields.media).toBe("File 2: Instagram takes images from 4:5 to 1.91:1");

    const ok = await addFile(owner, postId, { width: 1080, height: 1350 });
    expect(ok.body).toMatchObject({ status: "SCHEDULED" });
    expect(ok.body.media).toHaveLength(2);
  });

  it("a failed post becomes a draft when its files are fixed", async () => {
    const postId = await newPost(owner, burgerId, { platforms: ["FACEBOOK"], scheduledAt: inHours(1) });
    await prisma.post.update({ where: { id: postId }, data: { status: PostStatus.FAILED } });
    expect((await addFile(owner, postId)).body.status).toBe("DRAFT");
  });

  it("a published post's files can't change", async () => {
    const postId = await newPost(owner, burgerId, { platforms: ["FACEBOOK"], scheduledAt: inHours(1) });
    const file = (await addFile(owner, postId)).body.media[0] as Media;
    await prisma.post.update({ where: { id: postId }, data: { status: PostStatus.PUBLISHED } });
    expect((await owner.post(`/api/posts/${postId}/media/upload`).expect(409)).body.code).toBe("POST_PUBLISHED");
    await owner.delete(`/api/posts/${postId}/media/${file.id}`).expect(409);
  });

  it("another agency gets 404 for everything", async () => {
    const postId = await newPost(owner, burgerId);
    const file = (await addFile(owner, postId)).body.media[0] as Media;
    await ownerB.post(`/api/posts/${postId}/media/upload`).expect(404);
    await ownerB.post(`/api/posts/${postId}/media`).send({ publicId: file.publicId, type: "IMAGE" }).expect(404);
    await ownerB
      .put(`/api/posts/${postId}/media/order`)
      .send({ ids: [file.id] })
      .expect(404);
    await ownerB.delete(`/api/posts/${postId}/media/${file.id}`).expect(404);
  });

  it("deleting a post deletes its files from the store", async () => {
    const postId = await newPost(editor, burgerId);
    const files = (await addFile(editor, postId)).body.media as Media[];
    await editor.delete(`/api/posts/${postId}`).expect(204);
    expect(storage.files.has(files[0].publicId)).toBe(false);
    expect(await prisma.postMedia.count({ where: { postId } })).toBe(0);
  });
});
