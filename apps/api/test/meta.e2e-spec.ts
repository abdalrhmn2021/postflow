import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { App } from "supertest/types.js";
import { hashPassword } from "../src/auth/password.js";
import { Role } from "../src/generated/prisma/client.js";
import { MediaStorage } from "../src/media/media-storage.js";
import { MetaGraph, type MetaPage } from "../src/meta/meta-graph.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { RedisService } from "../src/redis/redis.service.js";
import { startApp, uniqueRun } from "./app.js";
import { FakeMediaStorage } from "./fake-media-storage.js";
import { FakeMeta } from "./fake-meta.js";

const RUN = uniqueRun();
const PASSWORD = "a-long-password";
const inHours = (h: number) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString();

type Agent = ReturnType<typeof request.agent>;

// Two pages the owner manages on Facebook: the burger page has Instagram linked, the coffee page doesn't.
const BURGER_PAGE: MetaPage = {
  id: "1001",
  name: "Burger Hum",
  picture: "https://fb.test/burger.jpg",
  token: "PAGE-TOKEN-BURGER-secret",
  instagram: { id: "17841", username: "burgerhum", picture: "https://ig.test/burger.jpg" },
};
const COFFEE_PAGE: MetaPage = {
  id: "1002",
  name: "Coffee Corner",
  picture: null,
  token: "PAGE-TOKEN-COFFEE-secret",
  instagram: null,
};

describe("connecting Facebook pages", () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const meta = new FakeMeta();
  const storage = new FakeMediaStorage();
  const ips: string[] = [];

  let owner: Agent, manager: Agent, ownerB: Agent;
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

  // The whole trip: "Connect" -> Facebook (the fake) -> back with a code -> the site's URL.
  async function login(agent: Agent, brandId: string, code: string | null, lang = "en") {
    const start = await agent.get(`/api/brands/${brandId}/meta/connect?lang=${lang}`).expect(302);
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const query = code ? { state, code } : { state, error: "access_denied" };
    const back = await agent.get("/api/meta/callback").query(query).expect(302);
    return new URL(back.headers.location);
  }

  beforeAll(async () => {
    app = await startApp((b) => {
      b.overrideProvider(MetaGraph).useValue(meta);
      b.overrideProvider(MediaStorage).useValue(storage);
    });
    prisma = app.get(PrismaService);

    const a = await register("a");
    owner = a.agent;
    burgerId = (await owner.post("/api/brands").send({ name: "Burger" }).expect(201)).body.id;
    coffeeId = (await owner.post("/api/brands").send({ name: "Coffee" }).expect(201)).body.id;

    const email = `manager@a.${RUN}.test`;
    await prisma.user.create({
      data: { agencyId: a.agencyId, role: Role.MANAGER, email, name: "M", passwordHash: await hashPassword(PASSWORD) },
    });
    manager = request.agent(app.getHttpServer());
    ips.push("198.51.100.211");
    await manager
      .post("/api/auth/login")
      .set("X-Forwarded-For", ips[0])
      .send({ email, password: PASSWORD })
      .expect(200);

    ownerB = (await register("b")).agent;
    meta.codes.set("code-1", [BURGER_PAGE, COFFEE_PAGE]);
    meta.codes.set("code-none", []);
  });

  afterAll(async () => {
    await prisma?.agency.deleteMany({ where: { slug: { startsWith: RUN } } });
    await Promise.all(ips.map((ip) => app?.get(RedisService).client.del(`login-attempts:${ip}`)));
    await app?.close();
  });

  it("the site can ask whether connecting is set up", async () => {
    expect((await manager.get("/api/meta").expect(200)).body).toEqual({ configured: true });
  });

  it("only the owner connects, and only their agency's clients", async () => {
    await manager.get(`/api/brands/${burgerId}/meta/connect`).expect(403);
    await ownerB.get(`/api/brands/${burgerId}/meta/connect`).expect(404);
  });

  it("'Connect' goes to Facebook with a one-time state, and the way back to our site", async () => {
    const res = await owner.get(`/api/brands/${burgerId}/meta/connect?lang=en`).expect(302);
    const url = new URL(res.headers.location);
    expect(url.host).toBe("facebook.test");
    expect(url.searchParams.get("state")).toMatch(/^[\w-]{32}$/);
    expect(url.searchParams.get("redirect_uri")).toMatch(/\/api\/meta\/callback$/);
  });

  it("Cancel on Facebook, an unknown state, or a state used twice: back to the site with the reason", async () => {
    const denied = await login(owner, burgerId, null);
    expect(denied.pathname + denied.search).toBe(`/en/dashboard/brands/${burgerId}?meta_error=denied`);

    const unknown = await owner.get("/api/meta/callback").query({ state: "made-up", code: "code-1" }).expect(302);
    expect(unknown.headers.location).toMatch(/\/ar\/dashboard\/brands\?meta_error=expired$/);

    const start = await owner.get(`/api/brands/${burgerId}/meta/connect`).expect(302);
    const state = new URL(start.headers.location).searchParams.get("state")!;
    await owner.get("/api/meta/callback").query({ state, code: "code-1" }).expect(302);
    const replay = await owner.get("/api/meta/callback").query({ state, code: "code-1" }).expect(302);
    expect(replay.headers.location).toMatch(/meta_error=expired$/);
  });

  it("a Facebook account with no pages, or a code Facebook refuses, says so", async () => {
    expect((await login(owner, burgerId, "code-none")).search).toBe("?meta_error=no_pages");
    expect((await login(owner, burgerId, "bad-code")).search).toBe("?meta_error=failed");
  });

  it("another person's state is refused - the answer must be for the login THEY started", async () => {
    const start = await owner.get(`/api/brands/${burgerId}/meta/connect`).expect(302);
    const state = new URL(start.headers.location).searchParams.get("state")!;
    const res = await ownerB.get("/api/meta/callback").query({ state, code: "code-1" }).expect(302);
    expect(res.headers.location).toMatch(/meta_error=expired$/);
  });

  let pick: string;

  it("the pages come back to choose from - names and pictures, never tokens", async () => {
    const back = await login(owner, burgerId, "code-1");
    expect(back.pathname).toBe(`/en/dashboard/brands/${burgerId}`);
    pick = back.searchParams.get("meta")!;

    const res = await owner.get(`/api/brands/${burgerId}/meta/pages/${pick}`).expect(200);
    expect(res.body).toEqual([
      {
        id: "1001",
        name: "Burger Hum",
        picture: "https://fb.test/burger.jpg",
        instagram: { id: "17841", username: "burgerhum", picture: "https://ig.test/burger.jpg" },
        takenBy: null,
      },
      { id: "1002", name: "Coffee Corner", picture: null, instagram: null, takenBy: null },
    ]);
    expect(JSON.stringify(res.body)).not.toContain("PAGE-TOKEN");

    // The list is the owner's, for this client only.
    await owner.get(`/api/brands/${coffeeId}/meta/pages/${pick}`).expect(404);
    await ownerB.get(`/api/brands/${burgerId}/meta/pages/${pick}`).expect(404);
  });

  it("picking a page connects it; the token is stored encrypted and never shown", async () => {
    const res = await owner.put(`/api/brands/${burgerId}/meta`).send({ pick, pageId: "1001" }).expect(200);
    expect(res.body).toMatchObject({ pageName: "Burger Hum", instagramUsername: "burgerhum", status: "OK" });
    expect(JSON.stringify(res.body)).not.toContain("PAGE-TOKEN");

    const row = await prisma.socialAccount.findUniqueOrThrow({ where: { brandId: burgerId } });
    expect(row.pageToken).toMatch(/^v1\./);
    expect(row.pageToken).not.toContain("PAGE-TOKEN");

    const brand = await manager.get(`/api/brands/${burgerId}`).expect(200);
    expect(brand.body.account).toMatchObject({ pageId: "1001", instagramId: "17841" });
    expect(JSON.stringify(brand.body)).not.toContain("pageToken");

    // The list is used up: its tokens are gone.
    await owner.get(`/api/brands/${burgerId}/meta/pages/${pick}`).expect(404);
  });

  it("a page already on another client is marked, and can't be connected twice", async () => {
    const coffeePick = (await login(owner, coffeeId, "code-1")).searchParams.get("meta")!;
    const list = await owner.get(`/api/brands/${coffeeId}/meta/pages/${coffeePick}`).expect(200);
    expect(list.body.map((p: { takenBy: string | null }) => p.takenBy)).toEqual(["Burger", null]);

    const res = await owner.put(`/api/brands/${coffeeId}/meta`).send({ pick: coffeePick, pageId: "1001" }).expect(409);
    expect(res.body.code).toBe("PAGE_IN_USE");
    await owner.put(`/api/brands/${coffeeId}/meta`).send({ pick: coffeePick, pageId: "1002" }).expect(200);
  });

  it("scheduling needs the platforms' accounts: Coffee has a page but no Instagram", async () => {
    const image = async (postId: string) => {
      const { publicId } = (await owner.post(`/api/posts/${postId}/media/upload`).expect(200)).body;
      storage.upload(publicId);
      await owner.post(`/api/posts/${postId}/media`).send({ publicId, type: "IMAGE" }).expect(200);
    };
    const post = async (brandId: string, platforms: string[]) => {
      const id = (
        await owner
          .post("/api/posts")
          .send({ brandId, caption: "عرض", platforms, scheduledAt: inHours(3) })
          .expect(201)
      ).body.id as string;
      await image(id);
      return id;
    };

    const coffeeBoth = await post(coffeeId, ["FACEBOOK", "INSTAGRAM"]);
    const refused = await owner.post(`/api/posts/${coffeeBoth}/schedule`).expect(400);
    expect(refused.body.fields).toEqual({ platforms: "The client's Instagram account isn't connected" });
    await owner.post(`/api/posts/${await post(coffeeId, ["FACEBOOK"])}/schedule`).expect(200);
    await owner.post(`/api/posts/${await post(burgerId, ["FACEBOOK", "INSTAGRAM"])}/schedule`).expect(200);
  });

  it("check: Meta refusing the token marks the page 'needs reconnect', and scheduling stops", async () => {
    const ok = await manager.post(`/api/brands/${burgerId}/meta/check`).expect(200);
    expect(ok.body.status).toBe("OK");

    meta.refused.add(BURGER_PAGE.token);
    const bad = await manager.post(`/api/brands/${burgerId}/meta/check`).expect(200);
    expect(bad.body.status).toBe("NEEDS_RECONNECT");

    const id = (
      await owner
        .post("/api/posts")
        .send({ brandId: burgerId, caption: "x", platforms: ["FACEBOOK"], scheduledAt: inHours(3) })
        .expect(201)
    ).body.id;
    const res = await owner.post(`/api/posts/${id}/schedule`).expect(400);
    expect(res.body.fields.platforms).toBe("The client's Facebook page isn't connected");

    // Connecting again fixes it.
    meta.refused.delete(BURGER_PAGE.token);
    const again = (await login(owner, burgerId, "code-1")).searchParams.get("meta")!;
    const back = await owner.put(`/api/brands/${burgerId}/meta`).send({ pick: again, pageId: "1001" }).expect(200);
    expect(back.body.status).toBe("OK");
    await owner.post(`/api/posts/${id}/schedule`).expect(200);
  });

  it("disconnecting: owner only; the client has no page afterwards", async () => {
    await manager.delete(`/api/brands/${coffeeId}/meta`).expect(403);
    await ownerB.delete(`/api/brands/${coffeeId}/meta`).expect(404);
    await owner.delete(`/api/brands/${coffeeId}/meta`).expect(204);
    expect((await owner.get(`/api/brands/${coffeeId}`).expect(200)).body.account).toBeNull();
    expect((await owner.delete(`/api/brands/${coffeeId}/meta`).expect(404)).body.code).toBe("ACCOUNT_NOT_FOUND");
  });
});
