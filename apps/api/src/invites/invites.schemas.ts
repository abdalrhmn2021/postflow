import { z } from "zod";
import { Role } from "../generated/prisma/client.js";

// The same email rule as sign-up: stored lower-case, so "Ali@Mail.com" and "ali@mail.com" are one person.
const email = z.string().trim().toLowerCase().max(254).pipe(z.email("Invalid email address"));

export const createInviteSchema = z.object({
  email,
  // An agency has one owner (the one who signed it up), so an invite is for a manager or an editor.
  role: z.enum([Role.MANAGER, Role.EDITOR], "Must be MANAGER or EDITOR"),
});

// The secret from the link: 32 random bytes in base64url = 43 characters.
const token = z.string().trim().min(20, "Invalid invite").max(100, "Invalid invite");

export const acceptInviteSchema = z.object({
  token,
  name: z.string().trim().min(2, "At least 2 characters").max(80, "At most 80 characters"),
  password: z.string().min(8, "At least 8 characters").max(128, "At most 128 characters"),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
