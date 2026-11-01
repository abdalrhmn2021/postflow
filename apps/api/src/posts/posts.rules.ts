import { MediaType, Platform } from "../generated/prisma/client.js";
import type { Connected } from "../meta/account.js";

// The platforms' own limits. Meta refuses a post past them, so we say so before scheduling,
// not hours later when the worker tries to publish.
export const CAPTION_MAX = 63_206; // Facebook
export const INSTAGRAM_CAPTION_MAX = 2_200;
export const INSTAGRAM_HASHTAGS_MAX = 30;
// Instagram crops nothing: an image must already be between 4:5 (tall) and 1.91:1 (wide).
export const INSTAGRAM_RATIO_MIN = 4 / 5;
export const INSTAGRAM_RATIO_MAX = 1.91;
// One video alone goes out as a Reel (3 s to 15 min); a video inside a carousel, at most 60 s.
export const INSTAGRAM_REEL_SECONDS = { min: 3, max: 15 * 60 };
export const INSTAGRAM_CAROUSEL_VIDEO_SECONDS = 60;
// A phone's 1080x1350 is 0.8 exactly, but 1079x1350 shouldn't fail on a pixel.
const RATIO_TOLERANCE = 0.01;

// #word in any language (#برجر, #gaza_food, #2026). The same thing Instagram counts.
export function countHashtags(caption: string): number {
  return caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
}

type MediaFacts = { type: MediaType; width: number; height: number; duration: number | null };
type Schedulable = {
  caption: string;
  platforms: Platform[];
  scheduledAt: Date | null;
  media: MediaFacts[];
  connected?: Connected; // the brand's connected accounts; undefined = not checked (Meta not set up)
};

// What still stops a post from being scheduled, one message per field - the same shape as a
// VALIDATION_ERROR, so the editor shows each one under its input. {} = ready.
export function problemsBeforeScheduling(post: Schedulable, now = new Date()): Record<string, string> {
  const problems: Record<string, string> = {};

  if (!post.caption.trim()) problems.caption = "Write the post first";
  if (post.platforms.length === 0) problems.platforms = "Pick at least one platform";
  else if (post.connected) {
    // Nobody could publish it: the worker would only find out at the time, and fail.
    if (post.platforms.includes(Platform.FACEBOOK) && !post.connected.facebook) {
      problems.platforms = "The client's Facebook page isn't connected";
    } else if (post.platforms.includes(Platform.INSTAGRAM) && !post.connected.instagram) {
      problems.platforms = "The client's Instagram account isn't connected";
    }
  }

  if (!post.scheduledAt) problems.scheduledAt = "Pick a time";
  else if (post.scheduledAt <= now) problems.scheduledAt = "The time has already passed";

  if (post.platforms.includes(Platform.INSTAGRAM)) {
    if (post.caption.length > INSTAGRAM_CAPTION_MAX) {
      problems.caption ??= `Instagram allows at most ${INSTAGRAM_CAPTION_MAX} characters`;
    } else if (countHashtags(post.caption) > INSTAGRAM_HASHTAGS_MAX) {
      problems.caption ??= `Instagram allows at most ${INSTAGRAM_HASHTAGS_MAX} hashtags`;
    }
  }

  const media = mediaProblem(post.platforms, post.media);
  if (media) problems.media = media;
  return problems;
}

// The first problem with the post's files on its platforms, or null. Files are numbered from 1,
// as the editor shows them. Meta's rules, checked here so the post fails now, not at publish time.
function mediaProblem(platforms: Platform[], media: MediaFacts[]): string | null {
  if (platforms.includes(Platform.INSTAGRAM)) {
    if (media.length === 0) return "Instagram needs an image or a video";

    for (const [i, file] of media.entries()) {
      const n = i + 1;
      if (file.type === MediaType.IMAGE) {
        const ratio = file.width / file.height;
        if (ratio < INSTAGRAM_RATIO_MIN - RATIO_TOLERANCE || ratio > INSTAGRAM_RATIO_MAX + RATIO_TOLERANCE) {
          return `File ${n}: Instagram takes images from 4:5 to 1.91:1`;
        }
      } else if (file.duration !== null) {
        if (media.length === 1) {
          const { min, max } = INSTAGRAM_REEL_SECONDS;
          if (file.duration < min || file.duration > max) return `File ${n}: Instagram takes videos of 3 s to 15 min`;
        } else if (file.duration > INSTAGRAM_CAROUSEL_VIDEO_SECONDS) {
          return `File ${n}: a video in a carousel is at most 60 s`;
        }
      }
    }
  }

  // A Facebook post is photos, or one video - not both, not two videos.
  if (platforms.includes(Platform.FACEBOOK) && media.length > 1 && media.some((f) => f.type === MediaType.VIDEO)) {
    return "Facebook takes a video on its own";
  }
  return null;
}
