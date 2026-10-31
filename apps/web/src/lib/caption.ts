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
// Field -> the key of its message in dict.fields. The API still checks; this only saves a round trip.
export type ScheduleProblem =
  "writeFirst" | "pickPlatform" | "pickTime" | "timePassed" | "instagramChars" | "instagramHashtags";

export function scheduleProblems(
  post: { caption: string; platforms: string[]; scheduledAt: string | null },
  now = new Date(),
): Partial<Record<"caption" | "platforms" | "scheduledAt", ScheduleProblem>> {
  const problems: Partial<Record<"caption" | "platforms" | "scheduledAt", ScheduleProblem>> = {};
  if (!post.caption.trim()) problems.caption = "writeFirst";
  if (post.platforms.length === 0) problems.platforms = "pickPlatform";
  if (!post.scheduledAt) problems.scheduledAt = "pickTime";
  else if (new Date(post.scheduledAt) <= now) problems.scheduledAt = "timePassed";
  if (post.platforms.includes("INSTAGRAM")) {
    if (post.caption.length > INSTAGRAM_CAPTION_MAX) problems.caption ??= "instagramChars";
    else if (countHashtags(post.caption) > INSTAGRAM_HASHTAGS_MAX) problems.caption ??= "instagramHashtags";
  }
  return problems;
}
