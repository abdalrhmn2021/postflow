"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { SocialAccount } from "@/lib/types";

type Props = {
  brandId: string;
  canDisconnect: boolean; // the owner
  t: Dictionary["accounts"];
  errors: Dictionary["errors"];
};

// "Check connection" (owner and managers) and "Disconnect" (owner, after a second click).
export function AccountActions({ brandId, canDisconnect, t, errors }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"check" | "disconnect" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "check" | "disconnect") {
    setBusy(action);
    setNotice(null);
    setError(null);
    try {
      if (action === "check") {
        const account = await api<SocialAccount>(`/brands/${brandId}/meta/check`, { method: "POST" });
        if (account.status === "OK") setNotice(t.checkedOk);
      } else {
        await api(`/brands/${brandId}/meta`, { method: "DELETE" });
        setConfirming(false);
      }
      router.refresh(); // the card above shows what the API says now
    } catch (err) {
      setError(errorText(err, errors));
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-xl border border-bad/30 bg-bad/5 p-4">
          <p className="font-medium">{t.disconnectConfirm}</p>
          <div className="flex gap-3">
            <Button variant="danger" loading={busy === "disconnect"} onClick={() => run("disconnect")}>
              {t.disconnectYes}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirming(false)}>
              {t.pickCancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" loading={busy === "check"} disabled={busy !== null} onClick={() => run("check")}>
            {t.check}
          </Button>
          {canDisconnect && (
            <Button variant="secondary" disabled={busy !== null} onClick={() => setConfirming(true)}>
              {t.disconnect}
            </Button>
          )}
          {notice && (
            <p role="status" className="text-sm text-good">
              {notice}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
