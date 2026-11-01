import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { CaptionWriter, type CaptionRequest } from "../src/ai/caption-writer.js";
import { AI_PER_HOUR } from "../src/ai/ai.service.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { RedisService } from "../src/redis/redis.service.js";
import { startApp, uniqueRun } from "./app.js";

const RUN = uniqueRun();

// Gemini, played by a function that writes down what it was asked.
class FakeWriter extends CaptionWriter {
  readonly configured = true;
  readonly asked: CaptionRequest[] = [];
  write(req: CaptionRequest) {
    this.asked.push(req);
    return Promise.resolve([
      { caption: "عرض الجمعة 🍔", hashtags: ["برجر"] },
      { caption: "جاهزين للجمعة؟", hashtags: [] },
      { caption: "وجبة عائلية بـ 45", hashtags: ["#غزة"] },
    ]);
  }
}

describe("AI caption ideas", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const writer = new FakeWriter();
  let owner: ReturnType<typeof request.agent>;
  let ownerB: ReturnType<typeof request.agent>;
  let brandId: string;
  let ownerId: string;

  async function register(slug: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post("/api/auth/register")
      .send({
        agencyName: `Agency ${slug}`,
        slug: `${RUN}-${slug}`,
        name: "Owner",
        email: `owner@${slug}.${RUN}.test`,
        password: "a-long-password",
      })
      .expect(201);
    return { agent, userId: res.body.user.id as string };
  }

  beforeAll(async () => {
    app = await startApp((b) => b.overrideProvider(CaptionWriter).useValue(writer));
    prisma = app.get(PrismaService);
    ({ agent: owner, userId: ownerId } = await register("a"));
    ownerB = (await register("b")).agent;
    brandId = (
      await owner.post("/api/brands").send({ name: "برجر هم", language: "ar", voice: "لهجة فلسطينية" }).expect(201)
    ).body.id;
  });

  afterAll(async () => {
    const redis = app?.get(RedisService).client;
    const keys = (await redis?.keys(`ai-captions:${ownerId}:*`)) ?? [];
    if (keys.length) await redis?.del(...keys);
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await app?.close();
  });

  it("says whether it's set up", async () => {
    expect((await owner.get("/api/ai").expect(200)).body).toEqual({ configured: true });
  });

  it("gives three ideas in the client's language and voice, hashtags after the text", async () => {
    const res = await owner
      .post("/api/ai/captions")
      .send({ brandId, brief: "عرض الجمعة: وجبة عائلية بـ 45 شيكل", platforms: ["INSTAGRAM"] })
      .expect(200);
    expect(res.body.ideas).toEqual(["عرض الجمعة 🍔\n\n#برجر", "جاهزين للجمعة؟", "وجبة عائلية بـ 45\n\n#غزة"]);
    expect(writer.asked.at(-1)).toMatchObject({
      brand: { name: "برجر هم", language: "ar", voice: "لهجة فلسطينية" },
      platforms: ["INSTAGRAM"],
      current: null,
    });
  });

  it("checks the idea, and the client must be one the person can see", async () => {
    const short = await owner.post("/api/ai/captions").send({ brandId, brief: "x" }).expect(400);
    expect(short.body.fields.brief).toBe("At least 3 characters");
    await ownerB.post("/api/ai/captions").send({ brandId, brief: "عرض الجمعة" }).expect(404);
  });

  it(`at most ${AI_PER_HOUR} requests per person per hour`, async () => {
    const asked = writer.asked.length;
    for (let i = asked; i < AI_PER_HOUR; i++) {
      await owner.post("/api/ai/captions").send({ brandId, brief: "عرض الجمعة" }).expect(200);
    }
    const res = await owner.post("/api/ai/captions").send({ brandId, brief: "عرض الجمعة" }).expect(429);
    expect(res.body.code).toBe("AI_LIMIT");
  });
});
