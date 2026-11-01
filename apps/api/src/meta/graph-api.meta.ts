import { createHmac } from "node:crypto";
import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env, MetaConfig } from "../config/env.js";
import { META_SCOPES, MetaGraph, type MetaPage, type PublishInput, type Published } from "./meta-graph.js";

const TIMEOUT_MS = 15_000;
const MAX_PAGES_OF_RESULTS = 5; // 5 x 100 pages is more than any agency person manages

// Meta's error answer: { error: { message, type, code, error_subcode } }.
// code 190 = the token is invalid or expired; 10 / 200-299 = a permission is missing.
const errorSchema = z.object({ error: z.object({ message: z.string(), code: z.number().optional() }) });

const pictureSchema = z.object({ data: z.object({ url: z.string() }) }).optional();
const instagramSchema = z
  .object({ id: z.string(), username: z.string().optional(), profile_picture_url: z.string().optional() })
  .optional();
const pageSchema = z.object({
  id: z.string(),
  name: z.string(),
  access_token: z.string().optional(), // only in /me/accounts
  picture: pictureSchema,
  instagram_business_account: instagramSchema,
});
const pageListSchema = z.object({
  data: z.array(pageSchema),
  paging: z.object({ next: z.string().optional() }).optional(),
});
const tokenSchema = z.object({ access_token: z.string() });

const idSchema = z.object({ id: z.string(), post_id: z.string().optional() });
const containerSchema = z.object({ status_code: z.string().optional() });
const permalinkSchema = z.object({ permalink: z.string().optional() });

// Instagram prepares each file (a "container") before it can be published: a video takes a while.
const CONTAINER_POLL_MS = 5_000;
const CONTAINER_WAIT_MS = 5 * 60_000;

// Meta's codes for "busy, try again later": unknown/temporary errors and the rate limits.
// (Everything else - a bad file, a missing permission - fails the same way the next time.)
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613, 9004, 9007]);

const PAGE_FIELDS = "id,name,picture{url},instagram_business_account{id,username,profile_picture_url}";

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined, // Meta's error code; undefined = no answer at all
  ) {
    super(message);
  }

  // Meta says the token can't be used any more - reconnecting is the fix, not retrying.
  get tokenRefused() {
    return this.code === 190 || this.code === 10 || (this.code !== undefined && this.code >= 200 && this.code < 300);
  }

  // Trying again later may work: no answer at all (network), Meta busy, or a rate limit.
  get retryable() {
    return this.code === undefined || RETRYABLE_CODES.has(this.code);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const notConfigured = () =>
  new ServiceUnavailableException({
    code: "META_NOT_CONFIGURED",
    message: "Connecting Facebook isn't set up on this server (META_APP_ID / META_APP_SECRET in apps/api/.env)",
  });
export const metaDown = () =>
  new BadGatewayException({ code: "META_ERROR", message: "Facebook didn't answer as expected - try again" });

function toPage(p: z.infer<typeof pageSchema>): Omit<MetaPage, "token"> {
  const ig = p.instagram_business_account;
  return {
    id: p.id,
    name: p.name,
    picture: p.picture?.data.url ?? null,
    instagram: ig ? { id: ig.id, username: ig.username ?? null, picture: ig.profile_picture_url ?? null } : null,
  };
}

@Injectable()
export class GraphApiMeta extends MetaGraph {
  private readonly logger = new Logger(GraphApiMeta.name);
  private readonly config: MetaConfig | undefined;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.config = config.get("META", { infer: true });
  }

  get configured() {
    return this.config !== undefined;
  }

  loginUrl(state: string, redirectUri: string) {
    const { appId, graphVersion } = this.need();
    const query = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: META_SCOPES.join(","),
    });
    return `https://www.facebook.com/${graphVersion}/dialog/oauth?${query}`;
  }

  async userToken(code: string, redirectUri: string) {
    const { appId, appSecret } = this.need();
    // The code -> a short-lived token (about an hour) -> a long-lived one (about 60 days).
    const short = tokenSchema.parse(
      await this.get("oauth/access_token", {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code,
      }),
    );
    const long = tokenSchema.parse(
      await this.get("oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: short.access_token,
      }),
    );
    return long.access_token;
  }

  async pages(userToken: string) {
    const pages: MetaPage[] = [];
    let next: string | undefined = this.url("me/accounts", {
      fields: `${PAGE_FIELDS},access_token`,
      limit: "100",
      ...this.auth(userToken),
    });
    for (let i = 0; next && i < MAX_PAGES_OF_RESULTS; i++) {
      const list = pageListSchema.parse(await this.fetchJson(next));
      for (const p of list.data) if (p.access_token) pages.push({ ...toPage(p), token: p.access_token });
      next = list.paging?.next;
    }
    return pages;
  }

  async checkPage(pageId: string, pageToken: string) {
    try {
      return toPage(pageSchema.parse(await this.get(pageId, { fields: PAGE_FIELDS, ...this.auth(pageToken) })));
    } catch (err) {
      if (err instanceof MetaApiError && err.tokenRefused) return null;
      throw err;
    }
  }

  async publishToFacebook(pageId: string, pageToken: string, { caption, media }: PublishInput): Promise<Published> {
    const auth = this.auth(pageToken);
    const video = media.find((m) => m.type === "VIDEO");

    if (video) {
      // A video post: Meta downloads the file from the URL and processes it in the background.
      const { id } = idSchema.parse(
        await this.post(`${pageId}/videos`, { file_url: video.url, description: caption, ...auth }),
      );
      return { id, url: `https://www.facebook.com/${pageId}/videos/${id}` };
    }
    if (media.length === 1) {
      const res = idSchema.parse(
        await this.post(`${pageId}/photos`, { url: media[0].url, caption, published: "true", ...auth }),
      );
      return { id: res.post_id ?? res.id, url: `https://www.facebook.com/${res.post_id ?? res.id}` };
    }
    // Text only, or several photos: each photo is uploaded unpublished, then one post holds them all.
    const photos = [];
    for (const m of media) {
      photos.push(idSchema.parse(await this.post(`${pageId}/photos`, { url: m.url, published: "false", ...auth })).id);
    }
    const attached = Object.fromEntries(
      photos.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]),
    );
    const { id } = idSchema.parse(await this.post(`${pageId}/feed`, { message: caption, ...attached, ...auth }));
    return { id, url: `https://www.facebook.com/${id}` };
  }

  async publishToInstagram(instagramId: string, pageToken: string, { caption, media }: PublishInput) {
    const auth = this.auth(pageToken);
    const container = async (params: Record<string, string>) => {
      const { id } = idSchema.parse(await this.post(`${instagramId}/media`, { ...params, ...auth }));
      await this.waitForContainer(id, auth);
      return id;
    };
    const file = (m: PublishInput["media"][number]): Record<string, string> =>
      m.type === "IMAGE" ? { image_url: m.url } : { video_url: m.url, media_type: "VIDEO" };

    let creationId: string;
    if (media.length === 1) {
      const [m] = media;
      creationId = await container(
        m.type === "IMAGE" ? { image_url: m.url, caption } : { video_url: m.url, media_type: "REELS", caption },
      );
    } else {
      const children = [];
      for (const m of media) children.push(await container({ ...file(m), is_carousel_item: "true" }));
      creationId = await container({ media_type: "CAROUSEL", children: children.join(","), caption });
    }

    const { id } = idSchema.parse(
      await this.post(`${instagramId}/media_publish`, { creation_id: creationId, ...auth }),
    );
    const { permalink } = permalinkSchema.parse(await this.get(id, { fields: "permalink", ...auth }));
    return { id, url: permalink ?? null };
  }

  // Waits until Instagram has the container ready (FINISHED), or says it can't (ERROR / EXPIRED).
  private async waitForContainer(id: string, auth: Record<string, string>) {
    const until = Date.now() + CONTAINER_WAIT_MS;
    for (;;) {
      const { status_code } = containerSchema.parse(await this.get(id, { fields: "status_code", ...auth }));
      if (status_code === undefined || status_code === "FINISHED") return;
      if (status_code === "ERROR" || status_code === "EXPIRED") {
        throw new MetaApiError(`Instagram couldn't process the file (${status_code})`, 100);
      }
      if (Date.now() > until) throw new MetaApiError("Instagram is still processing the file", undefined);
      await sleep(CONTAINER_POLL_MS);
    }
  }

  private need(): MetaConfig {
    if (!this.config) throw notConfigured();
    return this.config;
  }

  // The token, plus appsecret_proof: a signature of the token with the app secret. With "Require App
  // Secret" on in the app's settings, Meta refuses any call without it - so a stolen token alone is useless.
  private auth(token: string) {
    const { appSecret } = this.need();
    return { access_token: token, appsecret_proof: createHmac("sha256", appSecret).update(token).digest("hex") };
  }

  private url(path: string, query: Record<string, string>) {
    return `https://graph.facebook.com/${this.need().graphVersion}/${path}?${new URLSearchParams(query)}`;
  }

  private get(path: string, query: Record<string, string>) {
    return this.fetchJson(this.url(path, query));
  }

  // Graph API writes: the parameters as a form body (they hold the token - never in the URL).
  private post(path: string, params: Record<string, string>) {
    return this.fetchJson(this.url(path, {}), { method: "POST", body: new URLSearchParams(params) });
  }

  private async fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
    const where = url.split("?")[0]; // never log the query: it holds tokens and the app secret
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      this.logger.error(`Can't reach Meta (${where}): ${(err as Error).message}`);
      throw new MetaApiError("Can't reach Meta", undefined);
    }
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = errorSchema.safeParse(body);
      const message = parsed.success ? parsed.data.error.message : `HTTP ${res.status}`;
      this.logger.warn(`Meta refused ${where}: ${message}`);
      throw new MetaApiError(message, parsed.success ? parsed.data.error.code : undefined);
    }
    return body;
  }
}
