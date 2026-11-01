import { randomBytes } from "node:crypto";
import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AccountStatus } from "../generated/prisma/client.js";
import type { SessionUser } from "../auth/auth.service.js";
import { BrandsService } from "../brands/brands.service.js";
import type { Env } from "../config/env.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { accountSelect } from "./account.js";
import { metaDown, MetaApiError } from "./graph-api.meta.js";
import { MetaGraph, type MetaPage } from "./meta-graph.js";
import type { ConnectPageInput } from "./meta.schemas.js";
import { TokenCipher } from "./token-cipher.js";

// How long each step may take. The login: time to read Facebook's screens and say yes.
// The pick: time to choose a page on our side afterwards.
const LOGIN_TTL_S = 10 * 60;
const PICK_TTL_S = 15 * 60;
const loginKey = (state: string) => `meta-login:${state}`;
const pickKey = (pick: string) => `meta-pages:${pick}`;

type Login = { userId: string; brandId: string; lang: string };
type Pick = { userId: string; brandId: string; pages: MetaPage[] };

// Why the connect flow went back to the website without a page list - the site shows it in words.
export type ConnectError = "denied" | "expired" | "no_pages" | "failed";

const pickExpired = () =>
  new NotFoundException({ code: "META_PICK_EXPIRED", message: "That list of pages expired - connect again" });
const pageInUse = (brand: string) =>
  new ConflictException({ code: "PAGE_IN_USE", message: `This page is already connected to ${brand}`, brand });
const notConnected = () =>
  new NotFoundException({ code: "ACCOUNT_NOT_FOUND", message: "This client has no connected page" });

// Connecting a client to its Facebook page (and the Instagram account linked to that page):
//   1. loginUrl()  the owner presses "Connect" -> Facebook's login, with a one-time `state`
//   2. callback()  Facebook sends them back with a code -> we list their pages, keep the list for
//                  15 minutes under a random `pick` id, and send them to the client's page on the site
//   3. pages()     the site shows that list (names and pictures - tokens stay here)
//   4. connect()   the owner picks one -> its token is encrypted and stored on the client
// `state` is how we know the answer from Facebook is for the login WE started, for THIS person:
// without it, someone could send a victim a link that connects the attacker's page (OAuth CSRF).
@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);
  private readonly webUrl: string;

  constructor(
    private readonly meta: MetaGraph,
    private readonly brands: BrandsService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cipher: TokenCipher,
    config: ConfigService<Env, true>,
  ) {
    // The site, which forwards /api/* to us: Meta sends the browser back there, so the login cookie
    // (first-party to the site) comes along. The first one if WEB_ORIGIN lists several.
    this.webUrl = config.get("WEB_ORIGIN", { infer: true }).split(",")[0].trim().replace(/\/$/, "");
  }

  get configured() {
    return this.meta.configured;
  }

  private get redirectUri() {
    return `${this.webUrl}/api/meta/callback`; // must be listed in the Meta app's "Valid OAuth Redirect URIs"
  }

  async loginUrl(user: SessionUser, brandId: string, lang: string) {
    await this.brands.get(user, brandId); // 404 if it isn't this agency's
    const state = randomBytes(24).toString("base64url");
    const login: Login = { userId: user.id, brandId, lang: lang === "en" ? "en" : "ar" };
    const url = this.meta.loginUrl(state, this.redirectUri); // 503 first if Meta isn't set up
    await this.redis.client.set(loginKey(state), JSON.stringify(login), "EX", LOGIN_TTL_S);
    return url;
  }

  // Always answers with a URL on the site: the browser is mid-redirect, there's no page to show JSON on.
  async callback(user: SessionUser, query: { state?: string; code?: string; error?: string }) {
    // GETDEL: a state works once. The same answer from Facebook can't be replayed.
    const saved = query.state ? await this.redis.client.getdel(loginKey(query.state)) : null;
    const login = saved ? (JSON.parse(saved) as Login) : null;
    if (!login || login.userId !== user.id) return this.site("ar", null, { error: "expired" });

    if (query.error || !query.code) return this.site(login.lang, login.brandId, { error: "denied" });

    try {
      const pages = await this.meta.pages(await this.meta.userToken(query.code, this.redirectUri));
      if (pages.length === 0) return this.site(login.lang, login.brandId, { error: "no_pages" });

      const pick = randomBytes(18).toString("base64url");
      const data: Pick = { userId: user.id, brandId: login.brandId, pages };
      // Encrypted in Redis too: the list holds every page token of that person.
      await this.redis.client.set(pickKey(pick), this.cipher.encrypt(JSON.stringify(data)), "EX", PICK_TTL_S);
      return this.site(login.lang, login.brandId, { pick });
    } catch (err) {
      this.logger.error(`Connecting a page failed: ${(err as Error).message}`);
      return this.site(login.lang, login.brandId, { error: "failed" });
    }
  }

  // The pages to choose from: no tokens. takenBy: another client of the agency already uses it.
  async pages(user: SessionUser, brandId: string, pick: string) {
    const { pages } = await this.loadPick(user, brandId, pick);
    const taken = await this.takenPages(
      user,
      brandId,
      pages.map((p) => p.id),
    );
    return pages.map(({ token: _token, ...page }) => ({ ...page, takenBy: taken.get(page.id) ?? null }));
  }

  async connect(user: SessionUser, brandId: string, { pick, pageId }: ConnectPageInput) {
    const { pages } = await this.loadPick(user, brandId, pick);
    const page = pages.find((p) => p.id === pageId);
    if (!page) throw pickExpired();

    const takenBy = (await this.takenPages(user, brandId, [page.id])).get(page.id);
    if (takenBy) throw pageInUse(takenBy);

    const data = {
      pageId: page.id,
      pageName: page.name,
      pagePicture: page.picture,
      instagramId: page.instagram?.id ?? null,
      instagramUsername: page.instagram?.username ?? null,
      instagramPicture: page.instagram?.picture ?? null,
      pageToken: this.cipher.encrypt(page.token),
      status: AccountStatus.OK,
      checkedAt: new Date(),
    };
    // A client has one page: connecting again (another page, or the same after "needs reconnect") replaces it.
    const account = await this.prisma.socialAccount.upsert({
      where: { brandId },
      create: { ...data, brandId },
      update: { ...data, connectedAt: new Date() },
      select: accountSelect,
    });
    await this.redis.client.del(pickKey(pick)); // used: the other pages' tokens go too
    return account;
  }

  async disconnect(user: SessionUser, brandId: string) {
    await this.brands.get(user, brandId);
    const { count } = await this.prisma.socialAccount.deleteMany({ where: { brandId } });
    if (count === 0) throw notConnected();
    // Meta still lists PostFlow under the page's business integrations; the person can remove it
    // there. Without the stored token we can't post anyway.
  }

  // Asks Meta whether the stored token still works, and refreshes the name, picture and Instagram.
  async check(user: SessionUser, brandId: string) {
    await this.brands.get(user, brandId);
    const account = await this.prisma.socialAccount.findUnique({ where: { brandId } });
    if (!account) throw notConnected();

    let page: Awaited<ReturnType<MetaGraph["checkPage"]>>;
    try {
      page = await this.meta.checkPage(account.pageId, this.cipher.decrypt(account.pageToken));
    } catch (err) {
      if (err instanceof MetaApiError) throw metaDown();
      // The token can't be decrypted: TOKEN_ENCRYPTION_KEY changed. Same fix as a refused token.
      this.logger.error(`Can't decrypt the token of ${account.pageId}: ${(err as Error).message}`);
      page = null;
    }
    return this.prisma.socialAccount.update({
      where: { brandId },
      data: page
        ? {
            status: AccountStatus.OK,
            pageName: page.name,
            pagePicture: page.picture,
            instagramId: page.instagram?.id ?? null,
            instagramUsername: page.instagram?.username ?? null,
            instagramPicture: page.instagram?.picture ?? null,
            checkedAt: new Date(),
          }
        : { status: AccountStatus.NEEDS_RECONNECT, checkedAt: new Date() },
      select: accountSelect,
    });
  }

  private async loadPick(user: SessionUser, brandId: string, pick: string): Promise<Pick> {
    await this.brands.get(user, brandId);
    const stored = await this.redis.client.get(pickKey(pick));
    if (!stored) throw pickExpired();
    let data: Pick;
    try {
      data = JSON.parse(this.cipher.decrypt(stored)) as Pick;
    } catch {
      throw pickExpired();
    }
    // Only the person who logged in, and only for the client they started from.
    if (data.userId !== user.id || data.brandId !== brandId) throw pickExpired();
    return data;
  }

  // pageId -> the name of the agency's OTHER client that already has it.
  private async takenPages(user: SessionUser, brandId: string, pageIds: string[]) {
    const rows = await this.prisma.socialAccount.findMany({
      where: { pageId: { in: pageIds }, brandId: { not: brandId }, brand: { agencyId: user.agencyId } },
      select: { pageId: true, brand: { select: { name: true } } },
    });
    return new Map(rows.map((r) => [r.pageId, r.brand.name]));
  }

  private site(lang: string, brandId: string | null, result: { pick: string } | { error: ConnectError }) {
    const path = brandId ? `/${lang}/dashboard/brands/${encodeURIComponent(brandId)}` : `/${lang}/dashboard/brands`;
    const query = "pick" in result ? `meta=${result.pick}` : `meta_error=${result.error}`;
    return `${this.webUrl}${path}?${query}`;
  }
}
