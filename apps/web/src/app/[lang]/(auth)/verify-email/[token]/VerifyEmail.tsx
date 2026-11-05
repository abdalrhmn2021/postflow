"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";

type Props = { locale: Locale; token: string; t: Dictionary["auth"] };

// POST /api/auth/verify-email as soon as the page opens. A POST from the page (not a GET link to the
// API) so that email apps checking links ahead of time don't confirm on their own - harmless anyway.
export function VerifyEmail({ locale, token, t }: Props) {
  const [state, setState] = useState<"working" | "done" | "invalid">("working");
  const started = useRef(false); // React may run the effect twice in development

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api("/auth/verify-email", { method: "POST", body: { token } }).then(
      () => setState("done"),
      () => setState("invalid"),
    );
  }, [token]);

  if (state === "working") return <p className="text-muted">{t.verifying}</p>;

  return (
    <>
      <h1 className="text-2xl font-bold">{state === "done" ? t.verifiedTitle : t.verifyInvalidTitle}</h1>
      <p className="mt-2 text-muted">{state === "done" ? t.verifiedBody : t.verifyInvalidBody}</p>
      <p className="mt-6 text-center text-sm">
        <Link href={`/${locale}/dashboard`} className="font-semibold text-brand hover:underline">
          {t.toDashboard}
        </Link>
      </p>
    </>
  );
}
