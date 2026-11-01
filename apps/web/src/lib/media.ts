import type { Platform, PostMedia } from "./types";

// A post's images and videos - the same limits and rules as the API (apps/api/src/media/media.rules.ts
// and posts.rules.ts), so the editor warns before an upload or a schedule the API would refuse.

export const MEDIA_MAX = 10;
export const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"];
export const VIDEO_FORMATS = ["mp4", "mov"];
const MB = 1024 * 1024;
export const IMAGE_MAX_BYTES = 10 * MB;
export const VIDEO_MAX_BYTES = 100 * MB;

// For <input type="file" accept>: the file picker shows only these.
export const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";

export type MediaKind = PostMedia["type"];

// What a picked file is, or why it can't be uploaded - checked in the browser, before using any data.
// The key is the message's key in dict.fields; n fills its {n}.
const FROM_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export function checkFile(file: {
  name: string;
  type: string;
  size: number;
}): { kind: MediaKind } | { problem: "fileFormat" | "fileSize"; n: number } {
  // The file's type (image/jpeg), else its extension (.jpg) - some phones send no type.
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() ?? "";
  const format = FROM_MIME[file.type] ?? ext;
  const kind: MediaKind | null = IMAGE_FORMATS.includes(format)
    ? "IMAGE"
    : VIDEO_FORMATS.includes(format)
      ? "VIDEO"
      : null;
  if (!kind) return { problem: "fileFormat", n: 0 };
  const max = kind === "IMAGE" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
  if (file.size > max) return { problem: "fileSize", n: max / MB };
  return { kind };
}

// ---- Meta's rules (the API checks the same before scheduling) -------------------------------------

export type MediaProblem = "needsMedia" | "mediaRatio" | "reelLength" | "carouselVideo" | "facebookVideo";
type Facts = Pick<PostMedia, "type" | "width" | "height" | "duration">;

const RATIO_MIN = 4 / 5;
const RATIO_MAX = 1.91;
const TOLERANCE = 0.01;

// The problem with one file at position i of the post, on these platforms - for the red mark on its tile.
export function fileRuleProblem(platforms: Platform[], media: Facts[], i: number): MediaProblem | null {
  const file = media[i];
  if (platforms.includes("INSTAGRAM")) {
    if (file.type === "IMAGE") {
      const ratio = file.width / file.height;
      if (ratio < RATIO_MIN - TOLERANCE || ratio > RATIO_MAX + TOLERANCE) return "mediaRatio";
    } else if (file.duration !== null) {
      if (media.length === 1 && (file.duration < 3 || file.duration > 15 * 60)) return "reelLength";
      if (media.length > 1 && file.duration > 60) return "carouselVideo";
    }
  }
  return null;
}

// The first problem with the post's files, as the API reports it: { key, n } (n = the file's number).
export function mediaProblem(platforms: Platform[], media: Facts[]): { key: MediaProblem; n: number } | null {
  if (platforms.includes("INSTAGRAM") && media.length === 0) return { key: "needsMedia", n: 0 };
  for (let i = 0; i < media.length; i++) {
    const key = fileRuleProblem(platforms, media, i);
    if (key) return { key, n: i + 1 };
  }
  if (platforms.includes("FACEBOOK") && media.length > 1 && media.some((m) => m.type === "VIDEO")) {
    return { key: "facebookVideo", n: 0 };
  }
  return null;
}

// ---- Cloudinary URLs --------------------------------------------------------------------------------
// Cloudinary makes any size or format of a file from its URL: the transformation goes right after
// /upload/. So the editor never loads a 10 MB original for a 96-pixel tile.

function transform(url: string, step: string, ext?: string) {
  if (!url.includes("/upload/")) return url; // not a Cloudinary URL (the tests' fake store): as is
  const out = url.replace("/upload/", `/upload/${step}/`);
  return ext ? out.replace(/\.[a-z0-9]+$/i, `.${ext}`) : out;
}

// A square tile: images cropped to fill, videos as their first frame.
export function thumbUrl(media: Pick<PostMedia, "type" | "url">, size = 240) {
  const fill = `c_fill,w_${size},h_${size},q_auto`;
  return media.type === "IMAGE" ? transform(media.url, `${fill},f_auto`) : transform(media.url, `${fill},so_0`, "jpg");
}

// For the preview: an image at most 800 wide; a video as MP4 (a .mov from an iPhone doesn't play in Chrome).
export function previewUrl(media: Pick<PostMedia, "type" | "url">) {
  return media.type === "IMAGE"
    ? transform(media.url, "c_limit,w_800,q_auto,f_auto")
    : transform(media.url, "q_auto", "mp4");
}

// 75.4 -> "1:15"
export function formatDuration(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
