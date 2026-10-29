import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, hasLocale, LANG_COOKIE, pickLocale } from "./i18n/config";

const YEAR = 60 * 60 * 24 * 365;

// Runs before every page (Next.js 16 calls middleware "proxy").
//   /ar/..., /en/...  -> as is, and remember the language in the pf_lang cookie
//   anything else     -> the same path under the visitor's language: the cookie, else the browser's
//                        language (Accept-Language), else Arabic.   /login -> /ar/login
//   /<lang>/dashboard/... without the login cookie -> /<lang>/login?next=<where they were going>
//
// The dashboard check only looks for the cookie (fast, no API call). Whether the login is still valid
// is checked by the dashboard itself (lib/session.ts asks the API), which sends an expired one to /login.
// /login and /register never send a logged-in visitor away: with an expired cookie that would loop
// login -> dashboard -> login.
const SESSION_COOKIE = "pf_session"; // set by the API (apps/api/src/auth/session.ts)
const DASHBOARD = /^\/(ar|en)\/dashboard(\/|$)/;

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1];

  if (hasLocale(first)) {
    if (DASHBOARD.test(pathname) && !request.cookies.has(SESSION_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${first}/login`;
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }

    const response = NextResponse.next();
    if (request.cookies.get(LANG_COOKIE)?.value !== first) {
      response.cookies.set(LANG_COOKIE, first, { path: "/", maxAge: YEAR, sameSite: "lax" });
    }
    return response;
  }

  const saved = request.cookies.get(LANG_COOKIE)?.value;
  const locale = hasLocale(saved) ? saved : (pickLocale(request.headers.get("accept-language")) ?? defaultLocale);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Not for /api/* (forwarded to NestJS), Next.js's own files, or files with an extension (favicon.ico ...).
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
