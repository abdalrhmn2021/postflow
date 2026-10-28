import { z } from "zod";

// Agency URL name: postflow.app/<slug>. Lower-case letters, digits and single dashes, e.g. "centriva", "lamsa-media".
// Asked for in the form because an Arabic agency name doesn't turn into a good URL on its own.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Words the site needs for its own pages. Answered as "taken", like a real agency's slug.
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "approve",
  "auth",
  "dashboard",
  "help",
  "login",
  "logout",
  "postflow",
  "register",
  "settings",
  "signup",
  "static",
  "support",
  "www",
]);

export const registerSchema = z.object({
  agencyName: z.string().trim().min(2, "At least 2 characters").max(80, "At most 80 characters"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "At least 3 characters")
    .max(40, "At most 40 characters")
    .regex(SLUG_PATTERN, "Only English letters, numbers and dashes"),
  name: z.string().trim().min(2, "At least 2 characters").max(80, "At most 80 characters"),
  // Stored lower-case, so "Ali@Mail.com" and "ali@mail.com" are one account.
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Invalid email address")),
  // An upper limit too: hashing a 1 MB "password" on purpose would keep the CPU busy.
  password: z.string().min(8, "At least 8 characters").max(128, "At most 128 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
