import type { PublishMedia } from "../meta/meta-graph.js";

// The URL Meta should download a post's file from, in a format it takes.
// Cloudinary converts a file from its URL: the change goes right after /upload/.
//   images -> JPEG (Instagram takes nothing else; PNG and WebP are converted)
//   videos -> MP4 (a .mov from an iPhone is converted; an .mp4 is sent as it is)
// Other URLs (the tests' fake store) are sent unchanged.
export function publishUrl(media: { type: "IMAGE" | "VIDEO"; url: string; format: string }): PublishMedia {
  const cloudinary = media.url.includes("/upload/");
  if (!cloudinary) return { type: media.type, url: media.url };

  if (media.type === "IMAGE") {
    const jpeg = media.url.replace("/upload/", "/upload/f_jpg,q_auto:good/").replace(/\.[a-z0-9]+$/i, ".jpg");
    return { type: "IMAGE", url: jpeg };
  }
  if (media.format.toLowerCase() === "mp4") return { type: "VIDEO", url: media.url };
  return { type: "VIDEO", url: media.url.replace("/upload/", "/upload/f_mp4/").replace(/\.[a-z0-9]+$/i, ".mp4") };
}
