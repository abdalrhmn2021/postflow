import { AccountStatus, type Prisma } from "../generated/prisma/client.js";

// What the API shows of a connected account - everything but the token, which never leaves the server.
// Used by the brands' answers too (brand.account), so the website knows what each client has.
export const accountSelect = {
  pageId: true,
  pageName: true,
  pagePicture: true,
  instagramId: true,
  instagramUsername: true,
  instagramPicture: true,
  status: true,
  checkedAt: true,
  connectedAt: true,
} satisfies Prisma.SocialAccountSelect;

// Which platforms a brand can be published to right now. undefined = Meta isn't set up on this
// server (development): nothing is checked, so posts can still be scheduled while building.
export type Connected = { facebook: boolean; instagram: boolean } | undefined;

export function connectedPlatforms(
  account: { status: AccountStatus; instagramId: string | null } | null,
  metaConfigured: boolean,
): Connected {
  if (!metaConfigured) return undefined;
  const ok = account?.status === AccountStatus.OK;
  return { facebook: ok, instagram: ok && Boolean(account?.instagramId) };
}
