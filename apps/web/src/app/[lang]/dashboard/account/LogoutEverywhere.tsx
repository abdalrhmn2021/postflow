"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";

type Props = { locale: Locale; t: Dictionary["account"]; errors: Dictionary["errors"] };

// "Log out of every device": POST /api/auth/logout-all ends every login of this person (this one too),
// after a second click to confirm. Then to the login page.
export function LogoutEverywhere({ locale, t, errors }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logoutAll() {
    setLoading(true);
    setError(null);
    try {
      await api("/auth/logout-all", { method: "POST" });
      router.replace(`/${locale}/login`);
      router.refresh();
    } catch (err) {
      setError(errorText(err, errors));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{t.logoutAllTitle}</p>
        <p className="mt-1 text-sm text-muted">{t.logoutAllHint}</p>
      </div>
      <FormError message={error} />
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-xl border border-bad/30 bg-bad/5 p-4">
          <p className="font-medium">{t.logoutAllConfirm}</p>
          <div className="flex gap-3">
            <Button variant="danger" loading={loading} onClick={logoutAll}>
              {t.logoutAllYes}
            </Button>
            <Button variant="secondary" disabled={loading} onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            {t.logoutAll}
          </Button>
        </div>
      )}
    </div>
  );
}
