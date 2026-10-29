import type { Locale } from "@/i18n/config";

// Where to go after logging in: the ?next= the login page was opened with (proxy.ts sets it), else
// the dashboard. Only a path on this site - never "//evil.com" or "https://evil.com", or anyone could
// send a link to our login page that hands the user to a fake site right after they log in.
export function nextPath(value: string | null | undefined, locale: Locale): string {
  const fallback = `/${locale}/dashboard`;
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
