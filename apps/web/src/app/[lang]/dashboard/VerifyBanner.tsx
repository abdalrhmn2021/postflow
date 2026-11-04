"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";

type Props = { locale: Locale; email: string; t: Dictionary["verify"]; errors: Dictionary["errors"] };

// Above every dashboard page until the email is confirmed: a reminder, and "send the link again"
// (POST /api/auth/verify-email/send - at most 3 an hour).
export function VerifyBanner({ locale, email, t, errors }: Props) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function resend() {
    setLoading(true);
    try {
      await api("/auth/verify-email/send", { method: "POST", body: { lang: locale } });
      setMessage(t.resent);
    } catch (err) {
      setMessage(errorText(err, errors));
    } finally {
      setLoading(false);
    }
  }

  const [before, after] = t.banner.split("{email}");
  return (
    <div role="status" className="border-b border-line bg-brand/10">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <p className="flex-1">
          {before}
          <bdi className="font-medium">{email}</bdi>
          {after}
        </p>
        {message ? (
          <p className="font-medium">{message}</p>
        ) : (
          <Button variant="secondary" loading={loading} onClick={resend} className="h-9 px-3">
            {t.resend}
          </Button>
        )}
      </div>
    </div>
  );
}
