import { z } from "zod";
import { Platform } from "../generated/prisma/client.js";
import { CAPTION_MAX } from "./posts.rules.js";

// The longest range one calendar request may ask for: a month view with the days around it.
export const MAX_RANGE_DAYS = 62;

// Not trimmed: spaces and empty lines are part of how a caption looks.
const caption = z.string().max(CAPTION_MAX, `At most ${CAPTION_MAX} characters`);
const platforms = z.array(z.enum(Platform, "Must be FACEBOOK or INSTAGRAM")).transform((list) => [...new Set(list)]);
// An ISO time with its offset ("2026-11-05T18:30:00+02:00" or "...Z"); stored as UTC. null = no time yet.
const time = z.iso.datetime({ offset: true, message: "Must be a date and time" }).transform((v) => new Date(v));
const id = z.string().min(1, "Required");

// A new post is always a draft. Scheduling is its own step (POST /posts/:id/schedule).
export const createPostSchema = z.object({
  brandId: id,
  caption: caption.default(""),
  platforms: platforms.default([]),
  scheduledAt: time.nullable().default(null),
});

// Send only what changes. The brand of a post doesn't change: make a new post instead.
export const updatePostSchema = z
  .object({ caption, platforms, scheduledAt: time.nullable() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

// GET /posts?from=...&to=...&brandId=...  ->  posts with from <= scheduledAt < to
export const listPostsSchema = z
  .object({ from: time, to: time, brandId: id.optional() })
  .refine((q) => q.to > q.from, { message: "Must be after from", path: ["to"] })
  .refine((q) => q.to.getTime() - q.from.getTime() <= MAX_RANGE_DAYS * 24 * 60 * 60 * 1000, {
    message: `At most ${MAX_RANGE_DAYS} days at a time`,
    path: ["to"],
  });

// GET /posts/unscheduled?brandId=...  ->  drafts that have no time yet (they aren't on the calendar)
export const unscheduledPostsSchema = z.object({ brandId: id.optional() });

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type ListPostsQuery = z.infer<typeof listPostsSchema>;
export type UnscheduledPostsQuery = z.infer<typeof unscheduledPostsSchema>;
