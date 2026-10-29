"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { switchLocalePath, type Locale } from "@/i18n/config";

const linkClass =
  "rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-card hover:text-ink";

// Opens the same page in the other language: /ar/login <-> /en/login.
// proxy.ts then remembers the choice (pf_lang cookie) for the next visit to the bare site.
// On pages whose URL is only known when opened (/brands/<id>, /invite/<token>) the link streams in;
// until then the same label shows, not yet clickable.
export function LanguageSwitch({ current, label }: { current: Locale; label: string }) {
  return (
    <Suspense fallback={<span className={linkClass}>{label}</span>}>
      <SwitchLink current={current} label={label} />
    </Suspense>
  );
}

function SwitchLink({ current, label }: { current: Locale; label: string }) {
  const pathname = usePathname();
  const other: Locale = current === "ar" ? "en" : "ar";
  return (
    <Link href={switchLocalePath(pathname, other)} hrefLang={other} lang={other} className={linkClass}>
      {label}
    </Link>
  );
}
