// A Facebook page the person who logged in can manage, with the Instagram account linked to it.
export type MetaPage = {
  id: string;
  name: string;
  picture: string | null;
  token: string; // the page's own access token
  instagram: { id: string; username: string | null; picture: string | null } | null;
};

// What the API needs from Meta's Graph API. The app uses GraphApiMeta (graph-api.meta.ts);
// the e2e tests swap in a fake, so CI needs no Meta app and no network.
export abstract class MetaGraph {
  // false = META_APP_ID / META_APP_SECRET aren't set: connecting answers 503 META_NOT_CONFIGURED.
  abstract readonly configured: boolean;

  // Facebook's login page, asking for the permissions PostFlow needs. Meta sends the browser back
  // to redirectUri with ?code=...&state=... (or ?error=access_denied when the person says no).
  abstract loginUrl(state: string, redirectUri: string): string;

  // The code from that redirect -> a long-lived user token (about 60 days). Only used right away,
  // to list the pages: page tokens got from it don't expire.
  abstract userToken(code: string, redirectUri: string): Promise<string>;

  abstract pages(userToken: string): Promise<MetaPage[]>;

  // Does the stored page token still work? The page as Meta sees it now (its name and picture may
  // have changed, an Instagram account may have been linked), or null when Meta refuses the token.
  abstract checkPage(pageId: string, pageToken: string): Promise<Omit<MetaPage, "token"> | null>;
}

// The permissions asked for at login. Each one is reviewed by Meta before other agencies can use the app.
export const META_SCOPES = [
  "pages_show_list", // which pages the person manages
  "pages_read_engagement", // the pages' names, pictures and linked Instagram account
  "pages_manage_posts", // publish on the page (phase 4)
  "business_management", // pages owned by a Business portfolio, not by a person
  "instagram_basic", // the Instagram account's username and picture
  "instagram_content_publish", // publish on Instagram (phase 4)
];
