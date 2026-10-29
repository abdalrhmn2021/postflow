"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { switchLocalePath, type Locale } from "@/i18n/config";

// Opens the same page in the other language: /ar/login <-> /en/login.
// proxy.ts then remembers the choice (pf_lang cookie) for the next visit to the bare site.
export function LanguageSwitch({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const other: Locale = current === "ar" ? "en" : "ar";
  return (
    <Link
      href={switchLocalePath(pathname, other)}
      hrefLang={other}
      lang={other}
      className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-ink"
    >
      {label}
    </Link>
  );
}
