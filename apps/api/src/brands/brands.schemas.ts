import { z } from "zod";

// A real IANA time zone ("Asia/Hebron", "Europe/London"). The calendar turns UTC times into this zone,
// so a typo here would show every post at the wrong hour.
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const name = z.string().trim().min(1, "Required").max(80, "At most 80 characters");
const language = z.enum(["ar", "en"], "Must be ar or en");
// How the brand talks, for the AI caption writer (phase 6). Empty text = no voice.
const voice = z
  .string()
  .trim()
  .max(1000, "At most 1000 characters")
  .transform((v) => v || null)
  .nullable();
const timezone = z.string().trim().refine(isTimeZone, "Unknown time zone");

export const createBrandSchema = z.object({
  name,
  language: language.default("ar"),
  voice: voice.optional(),
  timezone: timezone.default("Asia/Hebron"),
});

// Every field optional: send only what changes.
export const updateBrandSchema = z
  .object({ name, language, voice, timezone })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

// The full list of editors on a brand (replaces the old list). [] = no editors.
export const setEditorsSchema = z.object({
  userIds: z
    .array(z.string().min(1))
    .max(100)
    .transform((ids) => [...new Set(ids)]),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
export type SetEditorsInput = z.infer<typeof setEditorsSchema>;
