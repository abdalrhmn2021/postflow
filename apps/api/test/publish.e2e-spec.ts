import type { INestApplication, INestApplicationContext } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { App } from "supertest/types.js";
import { AccountStatus, PostStatus } from "../src/generated/prisma/client.js";
import { MediaStorage } from "../src/media/media-storage.js";
import { MetaApiError } from "../src/meta/graph-api.meta.js";
import { MetaGraph } from "../src/meta/meta-graph.js";
import { TokenCipher } from "../src/meta/token-cipher.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { PublishQueue, publishJobId } from "../src/publish/publish.queue.js";
import { PublisherService, RetryLater } from "../src/publish/publisher.service.js";
import { WorkerModule } from "../src/worker/worker.module.js";
import { startApp, uniqueRun } from "./app.js";
import { FakeMediaStorage } from "./fake-media-storage.js";
import { FakeMeta } from "./fake-meta.js";

const RUN = uniqueRun();
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString();
const busy = () => new MetaApiError("Please retry your request later", 2);

type Agent = ReturnType<typeof request.agent>;

describe("publishing", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let queue: PublishQueue;
  let publisher: PublisherService;
  const meta = new FakeMeta();
  const storage = new FakeMediaStorage();

  let owner: Agent;
  let brandId: string;

  // A post for the brand, with `images` square images, scheduled `inS` seconds from now.
  async function scheduled(platforms: string[], images = 1, inS = 3600) {
    const id = (
      await owner
        .post("/api/posts")
        .send({ brandId, caption: "عرض الجمعة #برجر", platforms, scheduledAt: inSeconds(inS) })
        .expect(201)
    ).body.id as string;
    for (let i = 0; i < images; i++) {
      const { publicId } = (await owner.post(`/api/posts/${id}/media/upload`).expect(200)).body;
      storage.upload(publicId);
      await owner.post(`/api/posts/${id}/media`).send({ publicId, type: "IMAGE" }).expect(200);
    }
    const post = (await owner.post(`/api/posts/${id}/schedule`).expect(200)).body;
    return { id, at: new Date(post.scheduledAt).getTime() };
  }

  const status = async (id: string) => (await prisma.post.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    app = await startApp((b) => {
      b.overrideProvider(MetaGraph).useValue(meta);
      b.overrideProvider(MediaStorage).useValue(storage);
    });
    prisma = app.get(PrismaService);
    queue = app.get(PublishQueue);
    publisher = new PublisherService(prisma, meta, app.get(TokenCipher));

    owner = request.agent(app.getHttpServer());
    await owner
      .post("/api/auth/register")
      .send({
        agencyName: "Agency",
        slug: RUN,
        name: "Owner",
        email: `owner@${RUN}.test`,
        password: "a-long-password",
      })
      .expect(201);
    brandId = (await owner.post("/api/brands").send({ name: "Burger" }).expect(201)).body.id;
    // The brand's page, as the connect flow stores it (meta.e2e-spec.ts tests that flow).
    await prisma.socialAccount.create({
      data: {
        brandId,
        pageId: "1001",
        pageName: "Burger Hum",
        instagramId: "17841",
        instagramUsername: "burgerhum",
        pageToken: app.get(TokenCipher).encrypt("PAGE-TOKEN"),
      },
    });
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await app?.close();
  });

  beforeEach(() => {
    meta.sent.length = 0;
  });

  it("scheduling puts a delayed job on the queue, for that post at that time", async () => {
    const { id, at } = await scheduled(["FACEBOOK"]);
    const job = await queue.queue.getJob(publishJobId(id, at));
    expect(job?.data).toEqual({ postId: id, at });
    expect(await job?.isDelayed()).toBe(true);
    expect(job?.opts.delay).toBeGreaterThan(3500 * 1000);

    await owner.post(`/api/posts/${id}/unschedule`).expect(200);
    expect(await queue.queue.getJob(publishJobId(id, at))).toBeUndefined(); // unscheduled: the job goes
  });

  it("publishes to Facebook and Instagram, and records each with its link", async () => {
    const { id, at } = await scheduled(["FACEBOOK", "INSTAGRAM"], 2);
    expect(await publisher.publish(id, at, false)).toBe("published");

    expect(meta.sent.map((s) => [s.platform, s.account, s.token])).toEqual([
      ["FACEBOOK", "1001", "PAGE-TOKEN"],
      ["INSTAGRAM", "17841", "PAGE-TOKEN"],
    ]);
    expect(meta.sent[0].post.caption).toBe("عرض الجمعة #برجر");
    expect(meta.sent[0].post.media).toHaveLength(2);

    const post = (await owner.get(`/api/posts/${id}`).expect(200)).body;
    expect(post).toMatchObject({ status: "PUBLISHED", failReason: null });
    expect(post.publishedAt).not.toBeNull();
    expect(post.publications).toEqual(
      expect.arrayContaining([
        { platform: "FACEBOOK", status: "PUBLISHED", url: "https://facebook.test/fb-1", error: null },
        { platform: "INSTAGRAM", status: "PUBLISHED", url: "https://instagram.test/ig-2", error: null },
      ]),
    );
    expect(await publisher.publish(id, at, false)).toBe("skipped"); // a second job: nothing sent twice
    expect(meta.sent).toHaveLength(2);
  });

  it("a job for a post that was moved, unscheduled or deleted does nothing", async () => {
    const moved = await scheduled(["FACEBOOK"]);
    await owner
      .patch(`/api/posts/${moved.id}`)
      .send({ scheduledAt: inSeconds(7200) })
      .expect(200);
    expect(await publisher.publish(moved.id, moved.at, false)).toBe("skipped");
    const newAt = new Date((await owner.get(`/api/posts/${moved.id}`)).body.scheduledAt).getTime();
    expect(await queue.queue.getJob(publishJobId(moved.id, newAt))).toBeDefined(); // the job moved with it

    const deleted = await scheduled(["FACEBOOK"]);
    await owner.delete(`/api/posts/${deleted.id}`).expect(204);
    expect(await publisher.publish(deleted.id, deleted.at, false)).toBe("skipped");
    expect(meta.sent).toEqual([]);
  });

  it("Meta busy on Instagram: Facebook stays published, Instagram is tried again - and only Instagram", async () => {
    const { id, at } = await scheduled(["FACEBOOK", "INSTAGRAM"]);
    meta.failNext.INSTAGRAM.push(busy());
    await expect(publisher.publish(id, at, false)).rejects.toBeInstanceOf(RetryLater);
    expect(await status(id)).toBe(PostStatus.PUBLISHING);

    // Meanwhile nobody can change it.
    const res = await owner.patch(`/api/posts/${id}`).send({ caption: "x" }).expect(409);
    expect(res.body.code).toBe("POST_PUBLISHING");
    await owner.post(`/api/posts/${id}/unschedule`).expect(409);

    expect(await publisher.publish(id, at, false)).toBe("published");
    expect(meta.sent.map((s) => s.platform)).toEqual(["FACEBOOK", "INSTAGRAM"]); // Facebook once
  });

  it("Meta refusing for good: FAILED with its reason; fixed and scheduled again, only the failed platform goes", async () => {
    const { id, at } = await scheduled(["FACEBOOK", "INSTAGRAM"]);
    meta.failNext.INSTAGRAM.push(new MetaApiError("The aspect ratio is not supported", 36003));
    expect(await publisher.publish(id, at, false)).toBe("failed");

    const failed = (await owner.get(`/api/posts/${id}`).expect(200)).body;
    expect(failed).toMatchObject({ status: "FAILED", failReason: "Instagram: The aspect ratio is not supported" });

    // The manager fixes it (any change makes it a draft again), and schedules it again.
    await owner.patch(`/api/posts/${id}`).send({ caption: "عرض الجمعة - مصحح" }).expect(200);
    const again = (await owner.post(`/api/posts/${id}/schedule`).expect(200)).body;
    expect(again.failReason).toBeNull();
    meta.sent.length = 0;
    expect(await publisher.publish(id, at, false)).toBe("published");
    expect(meta.sent.map((s) => s.platform)).toEqual(["INSTAGRAM"]);
  });

  it("still busy on the last try: FAILED, with the reason", async () => {
    const { id, at } = await scheduled(["FACEBOOK"]);
    meta.failNext.FACEBOOK.push(busy());
    expect(await publisher.publish(id, at, true)).toBe("failed");
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).failReason).toBe(
      "Facebook: Please retry your request later",
    );
  });

  it("Meta refusing the page's token: FAILED, and the page is marked 'needs connecting again'", async () => {
    const { id, at } = await scheduled(["FACEBOOK"]);
    meta.failNext.FACEBOOK.push(new MetaApiError("Error validating access token", 190));
    expect(await publisher.publish(id, at, false)).toBe("failed");
    const account = await prisma.socialAccount.findUniqueOrThrow({ where: { brandId } });
    expect(account.status).toBe(AccountStatus.NEEDS_RECONNECT);
    await prisma.socialAccount.update({ where: { brandId }, data: { status: AccountStatus.OK } });
  });

  it("the page disconnected after scheduling: FAILED without calling Meta", async () => {
    const { id, at } = await scheduled(["FACEBOOK"]);
    await prisma.socialAccount.update({ where: { brandId }, data: { status: AccountStatus.NEEDS_RECONNECT } });
    expect(await publisher.publish(id, at, false)).toBe("failed");
    expect((await prisma.post.findUniqueOrThrow({ where: { id } })).failReason).toBe(
      "The client's Facebook page isn't connected",
    );
    expect(meta.sent).toEqual([]);
    await prisma.socialAccount.update({ where: { brandId }, data: { status: AccountStatus.OK } });
  });

  it("the real thing: the worker takes the job off the queue at its time and publishes", async () => {
    // Old jobs from the other tests (and other test files) out of the way first.
    await queue.queue.obliterate({ force: true });

    const builder = Test.createTestingModule({ imports: [WorkerModule] });
    builder.overrideProvider(MetaGraph).useValue(meta);
    const worker: INestApplicationContext = (await builder.compile()).createNestApplication();
    await worker.init(); // starts the BullMQ worker and its first sweep

    try {
      const { id } = await scheduled(["FACEBOOK"], 1, 3); // 3 seconds from now
      expect(await status(id)).toBe(PostStatus.SCHEDULED);
      const deadline = Date.now() + 20_000;
      while ((await status(id)) !== PostStatus.PUBLISHED && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(await status(id)).toBe(PostStatus.PUBLISHED);
      expect(meta.sent.map((s) => s.platform)).toEqual(["FACEBOOK"]);
    } finally {
      await worker.close();
    }
  });
});
