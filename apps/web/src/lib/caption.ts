import { mediaProblem, type MediaProblem } from "./media";
import type { Connected, Platform, PostMedia } from "./types";

// The platforms' limits on a caption - the same numbers as the API (apps/api/src/posts/posts.rules.ts),
// so the counter turns red exactly when scheduling would be refused.
export const INSTAGRAM_CAPTION_MAX = 2_200;
export const INSTAGRAM_HASHTAGS_MAX = 30;

const HASHTAG = /#[\p{L}\p{N}_]+/gu;

// #word in any language (#برجر, #gaza_food, #2026), as Instagram counts them.
export function countHashtags(caption: string): number {
  return caption.match(HASHTAG)?.length ?? 0;
}

// The caption cut into plain text and hashtags, so the preview can colour the tags.
export function splitHashtags(caption: string): { text: string; tag: boolean }[] {
  const out: { text: string; tag: boolean }[] = [];
  let last = 0;
  for (const match of caption.matchAll(HASHTAG)) {
    if (match.index > last) out.push({ text: caption.slice(last, match.index), tag: false });
    out.push({ text: match[0], tag: true });
    last = match.index + match[0].length;
  }
  if (last < caption.length) out.push({ text: caption.slice(last), tag: false });
  return out;
}

// The same checks the API makes before scheduling (problemsBeforeScheduling in posts.rules.ts),
// run in the browser first so a new post isn't created half-done just to hear what's missing.
// Field -> the key of its message in dict.fields, and the number for its {n}.
// The API still checks; this only saves a round trip.
export type ScheduleProblem =
  | "writeFirst"
  | "pickPlatform"
  | "pickTime"
  | "timePassed"
  | "instagramChars"
  | "instagramHashtags"
  | "facebookNotConnected"
  | "instagramNotConnected"
  | "notApproved"
  | MediaProblem;
type Field = "caption" | "platforms" | "scheduledAt" | "media" | "approval";

export function scheduleProblems(
  post: {
    caption: string;
    platforms: Platform[];
    scheduledAt: string | null;
    media: Pick<PostMedia, "type" | "width" | "height" | "duration">[];
    connected?: Connected; // the client's connected accounts; null / undefined = not checked
    approval?: { required: boolean; state: string }; // the client's approval; undefined = not checked
  },
  now = new Date(),
): Partial<Record<Field, { key: ScheduleProblem; n: number }>> {
  const problems: Partial<Record<Field, { key: ScheduleProblem; n: number }>> = {};
  if (!post.caption.trim()) problems.caption = { key: "writeFirst", n: 0 };
  if (post.platforms.length === 0) problems.platforms = { key: "pickPlatform", n: 0 };
  else if (post.connected) {
    if (post.platforms.includes("FACEBOOK") && !post.connected.facebook) {
      problems.platforms = { key: "facebookNotConnected", n: 0 };
    } else if (post.platforms.includes("INSTAGRAM") && !post.connected.instagram) {
      problems.platforms = { key: "instagramNotConnected", n: 0 };
    }
  }
  if (!post.scheduledAt) problems.scheduledAt = { key: "pickTime", n: 0 };
  else if (new Date(post.scheduledAt) <= now) problems.scheduledAt = { key: "timePassed", n: 0 };
  if (post.platforms.includes("INSTAGRAM")) {
    if (post.caption.length > INSTAGRAM_CAPTION_MAX) {
      problems.caption ??= { key: "instagramChars", n: INSTAGRAM_CAPTION_MAX };
    } else if (countHashtags(post.caption) > INSTAGRAM_HASHTAGS_MAX) {
      problems.caption ??= { key: "instagramHashtags", n: INSTAGRAM_HASHTAGS_MAX };
    }
  }
  const media = mediaProblem(post.platforms, post.media);
  if (media) problems.media = media;
  if (post.approval?.required && post.approval.state !== "APPROVED") problems.approval = { key: "notApproved", n: 0 };
  return problems;
}
