import type { MediaType } from "../generated/prisma/client.js";

// What the browser needs to upload one file straight to the store: where to POST it, and the
// signed fields to send with it (the file goes in a "file" field next to them).
export type UploadTicket = { url: string; fields: Record<string, string> };

// What the store says about a file - read from the store itself, never from the browser,
// so a post can't claim an image is 1080x1080 when it isn't.
export type StoredMedia = {
  publicId: string;
  type: MediaType;
  url: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  duration: number | null;
};

// The file store, as the rest of the API sees it. The app uses Cloudinary (cloudinary.storage.ts);
// the e2e tests swap in a fake, so CI needs no account and no network.
// An abstract class (not an interface) so it can be the Nest injection token too.
export abstract class MediaStorage {
  // false = CLOUDINARY_URL isn't set: uploads answer 503 MEDIA_NOT_CONFIGURED.
  abstract readonly configured: boolean;

  // Signed permission to upload ONE file under exactly this name. Valid for an hour.
  abstract uploadTicket(publicId: string): UploadTicket;

  // The file's details, or null if nothing was uploaded under that name.
  abstract find(publicId: string, type: MediaType): Promise<StoredMedia | null>;

  // Best effort: a file that can't be deleted now is only wasted space, never a reason to fail
  // the request that removed it from the post. Errors are logged, not thrown.
  abstract remove(files: { publicId: string; type: MediaType }[]): Promise<void>;

  // Deletes every file whose name starts with this prefix (a whole brand). Best effort too.
  abstract removePrefix(prefix: string): Promise<void>;
}

// postflow/<agencyId>/<brandId>/ - every file of one brand lives under this name.
export function brandMediaPrefix(agencyId: string, brandId: string) {
  return `postflow/${agencyId}/${brandId}/`;
}
