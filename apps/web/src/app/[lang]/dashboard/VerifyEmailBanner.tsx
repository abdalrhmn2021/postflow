"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";

type Props = {
  locale: Locale;
  email: string;
  t: Dictionary["dashboard"];
  errors: Dictionary["errors"];
};

// Shown on every dashboard page until the person confirms their email. Nothing is blocked meanwhile.
// "Send the link again": POST /api/auth/resend-verification (at most 3 an hour).
export function VerifyEmailBanner({ locale, email, t, errors }: Props) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState("sending");
    setError(null);
    try {
      await api("/auth/resend-verification", { method: "POST", body: { lang: locale } });
      setState("sent");
    } catch (err) {
      setError(errorText(err, errors)); // TOO_MANY_EMAILS, EMAIL_FAILED ...
      setState("idle");
    }
  }

  const [before, after] = t.verifyBanner.split("{email}");
  return (
    <div role="status" className="border-b border-accent/40 bg-accent/10">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
        <p>
          {before}
          <bdi className="font-semibold">{email}</bdi>
          {after}
        </p>
        {state === "sent" ? (
          <span className="font-semibold text-good">{t.verifyResent}</span>
        ) : (
          <button
            type="button"
            onClick={resend}
            disabled={state === "sending"}
            aria-busy={state === "sending" || undefined}
            className="font-semibold text-brand hover:underline disabled:opacity-60"
          >
            {t.verifyResend}
          </button>
        )}
        {error && <span className="text-bad">{error}</span>}
      </div>
    </div>
  );
}
