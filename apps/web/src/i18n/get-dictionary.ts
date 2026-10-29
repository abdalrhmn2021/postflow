import { notFound } from "next/navigation";
import { lang } from "next/root-params";
import { hasLocale, type Locale } from "./config";

// Server-only (next/root-params fails the build if this is imported in a Client Component).
// Each language is its own file, so a page only loads the one it shows.
const dictionaries = {
  ar: () => import("./dictionaries/ar").then((m) => m.ar),
  en: () => import("./dictionaries/en").then((m) => m.en),
};

// The language of the current URL (/ar/..., /en/...). Anything else is a 404.
export async function getLocale(): Promise<Locale> {
  const value = await lang();
  if (!hasLocale(value)) notFound();
  return value;
}

export async function getDictionary() {
  return dictionaries[await getLocale()]();
}
