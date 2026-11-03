import type { INestApplication, INestApplicationContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { randomBytes } from "node:crypto";
import request from "supertest";
import type { App } from "supertest/types.js";
import type { Env } from "../src/config/env.js";
import { AccountStatus, PostStatus } from "../src/generated/prisma/client.js";
import { MediaStorage } from "../src/media/media-storage.js";
import { MetaApiError } from "../src/meta/graph-api.meta.js";
import { MetaGraph } from "../src/meta/meta-graph.js";
import { decrypt, encrypt, TokenCipher } from "../src/meta/token-cipher.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { PublishQueue, publishJobId } from "../src/publish/publish.queue.js";
import { PublisherService, RetryLater } from "../src/publish/publisher.service.js";
import { INTERRUPTED, PublishWorker } from "../src/worker/publish.worker.js";
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

  describe("the hourly sweep", () => {
    // The worker's sweep, run by hand - without starting BullMQ's worker.
    const sweeper = (cipher = app.get(TokenCipher)) =>
      new PublishWorker(app.get(ConfigService), publisher, queue, prisma, cipher);

    // As if a try claimed it `minutesAgo` minutes ago and then the server stopped.
    async function stuckPublishing(id: string, minutesAgo: number) {
      await prisma.post.update({ where: { id }, data: { status: PostStatus.PUBLISHING } });
      const then = new Date(Date.now() - minutesAgo * 60_000);
      await prisma.$executeRaw`UPDATE "Post" SET "updatedAt" = ${then} WHERE id = ${id}`; // @updatedAt can't be set
    }

    it("a post stuck PUBLISHING with no job on it becomes FAILED - and can be scheduled again", async () => {
      const { id, at } = await scheduled(["FACEBOOK"]);
      await stuckPublishing(id, 60);
      await queue.queue.remove(publishJobId(id, at)); // Redis lost the job

      await sweeper().sweep();
      const post = await prisma.post.findUniqueOrThrow({ where: { id } });
      expect(post.status).toBe(PostStatus.FAILED);
      expect(post.failReason).toBe(INTERRUPTED);
      expect(meta.sent).toEqual([]); // never sent again on its own

      await owner.post(`/api/posts/${id}/schedule`).expect(200); // the website can change it again
      expect(await status(id)).toBe(PostStatus.SCHEDULED);
    });

    it("a job that already failed counts as no job", async () => {
      const { id, at } = await scheduled(["FACEBOOK"]);
      await stuckPublishing(id, 60);
      // Its job used up its tries (crashed on the last one): BullMQ keeps it, in the "failed" state.
      const getJob = queue.queue.getJob.bind(queue.queue);
      const spy = vi
        .spyOn(queue.queue, "getJob")
        .mockImplementation(async (jobId: string) =>
          jobId === publishJobId(id, at) ? ({ getState: async () => "failed" } as unknown as Job) : getJob(jobId),
        );
      try {
        await sweeper().sweep();
      } finally {
        spy.mockRestore();
      }
      expect(await status(id)).toBe(PostStatus.FAILED);
    });

    it("left alone: a post whose job is still on it, and one that started publishing a moment ago", async () => {
      const slow = await scheduled(["FACEBOOK"]); // its delayed job is still in the queue
      await stuckPublishing(slow.id, 60);
      const recent = await scheduled(["FACEBOOK"]);
      await stuckPublishing(recent.id, 1);
      await queue.queue.remove(publishJobId(recent.id, recent.at));

      await sweeper().sweep();
      expect(await status(slow.id)).toBe(PostStatus.PUBLISHING);
      expect(await status(recent.id)).toBe(PostStatus.PUBLISHING);
      await prisma.post.updateMany({
        where: { id: { in: [slow.id, recent.id] } },
        data: { status: PostStatus.DRAFT, scheduledAt: null },
      });
    });

    it("a try claiming the post bumps updatedAt, so a post being retried is never 'stuck'", async () => {
      const { id, at } = await scheduled(["FACEBOOK", "INSTAGRAM"]);
      meta.failNext.INSTAGRAM.push(busy());
      await expect(publisher.publish(id, at, false)).rejects.toThrow(RetryLater);
      const { updatedAt } = await prisma.post.findUniqueOrThrow({ where: { id } });
      expect(Date.now() - updatedAt.getTime()).toBeLessThan(60_000);
      await prisma.post.update({ where: { id }, data: { status: PostStatus.DRAFT, scheduledAt: null } });
    });

    it("changing TOKEN_ENCRYPTION_KEY: the page tokens on the old key are re-encrypted with the new one", async () => {
      const OLD = randomBytes(32);
      const NEW = randomBytes(32);
      const rotating = new TokenCipher({
        get: (name: string) =>
          name === "TOKEN_ENCRYPTION_KEY"
            ? NEW.toString("base64")
            : name === "TOKEN_ENCRYPTION_KEY_PREVIOUS"
              ? OLD.toString("base64")
              : undefined,
      } as unknown as ConfigService<Env, true>);
      const otherBrand = (await owner.post("/api/brands").send({ name: "Shawarma" }).expect(201)).body.id as string;
      await prisma.socialAccount.create({
        data: { brandId: otherBrand, pageId: "2002", pageName: "Shawarma", pageToken: encrypt("OLD-KEY-TOKEN", OLD) },
      });
      const before = (await prisma.socialAccount.findUniqueOrThrow({ where: { brandId } })).pageToken;

      await sweeper(rotating).sweep();
      const after = (await prisma.socialAccount.findUniqueOrThrow({ where: { brandId: otherBrand } })).pageToken;
      expect(decrypt(after, NEW)).toBe("OLD-KEY-TOKEN"); // the new key alone opens it now
      expect(() => decrypt(after, OLD)).toThrow();
      // A token neither key opens (here: the test key) is left exactly as it was.
      expect((await prisma.socialAccount.findUniqueOrThrow({ where: { brandId } })).pageToken).toBe(before);
    });
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
