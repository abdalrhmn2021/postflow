import { z } from "zod";
import { Platform } from "../generated/prisma/client.js";

// POST /ai/captions - the idea, for which client, where it will go, and the draft so far (if any).
export const captionsSchema = z.object({
  brandId: z.string().min(1, "Required"),
  brief: z.string().trim().min(3, "At least 3 characters").max(500, "At most 500 characters"),
  platforms: z.array(z.enum(Platform, "Must be FACEBOOK or INSTAGRAM")).default([]),
  current: z.string().max(5000).nullable().default(null),
});

export type CaptionsInput = z.infer<typeof captionsSchema>;
