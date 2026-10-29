import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getLocale } from "@/i18n/get-dictionary";
import type { Session } from "./types";

// Where the NestJS API runs - the same variable next.config.ts forwards /api/* to.
const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

// Who is logged in, for Server Components in the dashboard. Asks the API (GET /auth/me) with the
// browser's own cookies, so the API stays the one place that decides whether a login is valid.
//   no valid login (no cookie, expired, user removed) -> redirect to /<lang>/login
//   API down or a 5xx                                 -> throws; dashboard/error.tsx shows it
//
// Reads the request, so it must be called inside a <Suspense> boundary (Cache Components).
// cache(): the layout and the page both call it, but the API is asked once per request.
export const getSession = cache(async (): Promise<Session> => {
  const [locale, cookie] = await Promise.all([getLocale(), headers().then((h) => h.get("cookie"))]);

  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: cookie ? { cookie } : {},
    cache: "no-store",
  });

  if (res.status === 401) redirect(`/${locale}/login`);
  if (!res.ok) throw new Error(`GET /api/auth/me answered ${res.status}`);
  return (await res.json()) as Session;
});
