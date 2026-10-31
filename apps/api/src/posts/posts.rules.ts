import { Platform } from "../generated/prisma/client.js";

// The platforms' own limits. Meta refuses a post past them, so we say so before scheduling,
// not hours later when the worker tries to publish.
export const CAPTION_MAX = 63_206; // Facebook
export const INSTAGRAM_CAPTION_MAX = 2_200;
export const INSTAGRAM_HASHTAGS_MAX = 30;

// #word in any language (#برجر, #gaza_food, #2026). The same thing Instagram counts.
export function countHashtags(caption: string): number {
  return caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
}

type Schedulable = { caption: string; platforms: Platform[]; scheduledAt: Date | null };

// What still stops a post from being scheduled, one message per field - the same shape as a
// VALIDATION_ERROR, so the editor shows each one under its input. {} = ready.
// Step 5 of this phase adds: Instagram needs an image or a video.
export function problemsBeforeScheduling(post: Schedulable, now = new Date()): Record<string, string> {
  const problems: Record<string, string> = {};

  if (!post.caption.trim()) problems.caption = "Write the post first";
  if (post.platforms.length === 0) problems.platforms = "Pick at least one platform";

  if (!post.scheduledAt) problems.scheduledAt = "Pick a time";
  else if (post.scheduledAt <= now) problems.scheduledAt = "The time has already passed";

  if (post.platforms.includes(Platform.INSTAGRAM)) {
    if (post.caption.length > INSTAGRAM_CAPTION_MAX) {
      problems.caption ??= `Instagram allows at most ${INSTAGRAM_CAPTION_MAX} characters`;
    } else if (countHashtags(post.caption) > INSTAGRAM_HASHTAGS_MAX) {
      problems.caption ??= `Instagram allows at most ${INSTAGRAM_HASHTAGS_MAX} hashtags`;
    }
  }
  return problems;
}
