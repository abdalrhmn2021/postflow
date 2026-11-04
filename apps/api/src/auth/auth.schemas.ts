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

// The language of the page the person is on: the email they get is in it.
const lang = z.enum(["ar", "en"], "Must be ar or en").default("ar");
const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Invalid email address"));
// An upper limit too: hashing a 1 MB "password" on purpose would keep the CPU busy.
const newPassword = z.string().min(8, "At least 8 characters").max(128, "At most 128 characters");
// Links in emails: 32 random bytes, base64url (43 characters). Anything else is wrong anyway.
const linkToken = z.string().min(1, "Required").max(100, "At most 100 characters");

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
  email,
  password: newPassword,
  lang, // the "confirm your email" mail
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Required").max(128, "At most 128 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email, lang });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: linkToken, password: newPassword });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: linkToken });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const sendVerificationSchema = z.object({ lang });
export type SendVerificationInput = z.infer<typeof sendVerificationSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Required").max(128, "At most 128 characters"),
  newPassword,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
