import { MediaType } from "../generated/prisma/client.js";

// What a post's files may be, before any platform rule (those are in posts.rules.ts).
// The limits are Cloudinary's free plan (10 MB an image, 100 MB a video) - a bigger file is
// refused by Cloudinary itself; the API checks again when the file is attached.
export const MEDIA_MAX = 10; // per post: Instagram's carousel limit
export const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"];
export const VIDEO_FORMATS = ["mp4", "mov"];
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const MB = 1024 * 1024;

// What's wrong with one uploaded file, or null if it's fine.
export function fileProblem(file: { type: MediaType; format: string; bytes: number }): string | null {
  const isImage = file.type === MediaType.IMAGE;
  const formats = isImage ? IMAGE_FORMATS : VIDEO_FORMATS;
  if (!formats.includes(file.format.toLowerCase())) return `Must be ${formats.join(", ")}`;

  const max = isImage ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (file.bytes > max) return `At most ${max / MB} MB`;
  return null;
}
