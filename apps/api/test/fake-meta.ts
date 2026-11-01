import { MetaApiError } from "../src/meta/graph-api.meta.js";
import { MetaGraph, type MetaPage } from "../src/meta/meta-graph.js";

// Meta's Graph API, played by Maps - for the e2e tests (no Meta app, no network in CI).
// A test says which pages a login code brings back (codes), and which page tokens Meta now refuses.
export class FakeMeta extends MetaGraph {
  readonly configured = true;
  readonly codes = new Map<string, MetaPage[]>();
  readonly refused = new Set<string>();

  loginUrl(state: string, redirectUri: string) {
    return `https://facebook.test/dialog/oauth?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  userToken(code: string) {
    if (!this.codes.has(code)) return Promise.reject(new MetaApiError("Invalid verification code", 100));
    return Promise.resolve(`user-token-${code}`);
  }

  pages(userToken: string) {
    return Promise.resolve(this.codes.get(userToken.replace("user-token-", "")) ?? []);
  }

  checkPage(pageId: string, pageToken: string) {
    if (this.refused.has(pageToken)) return Promise.resolve(null);
    for (const pages of this.codes.values()) {
      const page = pages.find((p) => p.id === pageId);
      if (page) {
        const { token: _token, ...rest } = page;
        return Promise.resolve(rest);
      }
    }
    return Promise.resolve(null);
  }
}
