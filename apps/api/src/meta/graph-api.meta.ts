import { createHmac } from "node:crypto";
import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env, MetaConfig } from "../config/env.js";
import { META_SCOPES, MetaGraph, type MetaPage } from "./meta-graph.js";

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
}

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

  private async fetchJson(url: string): Promise<unknown> {
    const where = url.split("?")[0]; // never log the query: it holds tokens and the app secret
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
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
