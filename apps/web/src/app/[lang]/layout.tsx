import type { Metadata } from "next";
import { lang } from "next/root-params";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "../globals.css";
import { defaultLocale, dirOf, hasLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

// Every page lives under /ar or /en. Both are built ahead of time (cacheComponents needs at least one
// value for the root param); proxy.ts sends a URL without a language to the visitor's language.
export function generateStaticParams() {
  return locales.map((locale) => ({ lang: locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDictionary();
  return {
    title: { default: "PostFlow", template: "%s · PostFlow" },
    description: dict.meta.description,
  };
}

// Arabic: right to left; English: left to right. The font (IBM Plex Sans Arabic) has both scripts,
// and is bundled from npm (@fontsource), so the build downloads nothing.
export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const value = await lang();
  const locale = hasLocale(value) ? value : defaultLocale; // pages 404 an unknown language themselves
  return (
    <html lang={locale} dir={dirOf(locale)} className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
