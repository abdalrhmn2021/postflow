import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getLocale } from "@/i18n/get-dictionary";
import type { Session } from "./types";

// Where the NestJS API runs - the same variable next.config.ts forwards /api/* to.
const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

// Reads from the API in Server Components (dashboard pages), with the browser's own cookies,
// so the API decides who is logged in and what they may see - exactly as for the browser's calls.
//   401 (no valid login: no cookie, expired, user removed) -> redirect to /<lang>/login
//   404 (not there, or not yours)                          -> the not-found page
//   API down or another error                              -> throws; dashboard/error.tsx shows it
// Changes (POST, PATCH, DELETE) are made from the browser with api() (lib/api.ts), then router.refresh().
//
// Reads the request, so it must be called inside a <Suspense> boundary (Cache Components).
export async function serverApi<T>(path: string): Promise<T> {
  const data = await serverApiOrNull<T>(path);
  if (data === null) notFound();
  return data;
}

// The same, but a 404 is null instead of the not-found page - for a page that says it in its own words
// (an invite link that doesn't work).
export async function serverApiOrNull<T>(path: string): Promise<T | null> {
  const [locale, cookie] = await Promise.all([getLocale(), headers().then((h) => h.get("cookie"))]);

  const res = await fetch(`${API_URL}/api${path}`, {
    headers: cookie ? { cookie } : {},
    cache: "no-store",
  });

  if (res.status === 401) redirect(`/${locale}/login`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET /api${path} answered ${res.status}`);
  return (await res.json()) as T;
}

// Who is logged in. cache(): the layout and the page both call it, but the API is asked once per request.
export const getSession = cache(() => serverApi<Session>("/auth/me"));
