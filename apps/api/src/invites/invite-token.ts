import { createHash, randomBytes } from "node:crypto";

export const INVITE_DAYS = 7;

// A new invite secret: 32 random bytes (256 bits) - can't be guessed, so no attempt limit is needed.
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

// What the database keeps instead of the secret. SHA-256 is enough here (no bcrypt-style slowness):
// the secret is long and random, not a word a person chose, so it can't be found by trying words.
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// The link the owner sends: <the website>/invite/<secret>. WEB_ORIGIN may list several sites; the first one is used.
export function inviteLink(webOrigin: string, token: string): string {
  const site = webOrigin.split(",")[0]!.trim().replace(/\/+$/, "");
  return `${site}/invite/${token}`;
}
