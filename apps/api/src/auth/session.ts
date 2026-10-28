import type { CookieOptions } from "express";

// The login cookie. httpOnly: JavaScript in the page can't read it, so an injected script can't steal it.
// SameSite=Lax: the browser doesn't send it with forms posted from other sites (CSRF).
// The browser only talks to the Next.js site, which forwards /api/* here, so the cookie is first-party.
export const SESSION_COOKIE = "pf_session";
export const SESSION_DAYS = 7;

export function sessionCookieOptions(production: boolean): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: production, // HTTPS only in production; local development runs on http://localhost
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

// One cookie's value from a Cookie header ("a=1; pf_session=xyz"), or null.
export function readCookie(header: string | undefined, name: string): string | null {
  for (const part of header?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}
