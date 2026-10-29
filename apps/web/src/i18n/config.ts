// The site's languages. The language is the first part of every URL: /ar/login, /en/login.
// Safe to import anywhere (proxy, server and client components).

export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

// Arabic first: most agencies we serve work in Arabic.
export const defaultLocale: Locale = "ar";

// The last language a visitor used, so postflow.app/ (no language) opens in it. Set by proxy.ts.
export const LANG_COOKIE = "pf_lang";

export function hasLocale(value: string | undefined | null): value is Locale {
  return locales.includes(value as Locale);
}

export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

// The best of our languages for an Accept-Language header such as "en-US,en;q=0.9,ar;q=0.8"
// (highest q first; "en-US" counts as "en"), or null if the browser asks for none of them.
export function pickLocale(acceptLanguage: string | null | undefined): Locale | null {
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((w) => w.lang && Number.isFinite(w.q) && w.q > 0)
    .sort((a, b) => b.q - a.q);
  return wanted.map((w) => w.lang).find(hasLocale) ?? null;
}

// The same path in another language: /ar/login -> /en/login, /ar -> /en.
export function switchLocalePath(pathname: string, to: Locale): string {
  const rest = pathname.replace(/^\/(ar|en)(?=\/|$)/, "");
  return `/${to}${rest}`;
}
