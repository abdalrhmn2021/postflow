"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";

type Props = { locale: Locale; token: string; t: Dictionary["verify"] };

// POST /api/auth/verify-email { token } as soon as the page opens, then "confirmed" or "didn't work".
export function VerifyEmail({ locale, token, t }: Props) {
  const [state, setState] = useState<"checking" | "done" | "invalid">("checking");
  const sent = useRef(false); // React may run the effect twice in development: the link works once

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api("/auth/verify-email", { method: "POST", body: { token } }).then(
      () => setState("done"),
      () => setState("invalid"),
    );
  }, [token]);

  if (state === "checking") return <p className="text-muted">{t.checking}</p>;
  return (
    <>
      <h1 className="text-2xl font-bold">{state === "done" ? t.doneTitle : t.invalidTitle}</h1>
      <p className="mt-2 text-muted">{state === "done" ? t.doneBody : t.invalidBody}</p>
      <Link href={`/${locale}/dashboard`} className={buttonClass("primary", "mt-6 w-full")}>
        {t.toDashboard}
      </Link>
    </>
  );
}
