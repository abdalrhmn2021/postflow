"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";

type Props = {
  locale: Locale;
  brand: { id: string; name: string };
  t: Dictionary["brands"];
  errors: Dictionary["errors"];
};

// Delete a client, after a second click to confirm (on the page, not a browser pop-up).
// DELETE /api/brands/:id, then back to the list.
export function DeleteBrand({ locale, brand, t, errors }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setLoading(true);
    setError(null);
    try {
      await api(`/brands/${brand.id}`, { method: "DELETE" });
      router.replace(`/${locale}/dashboard/brands`);
      router.refresh();
    } catch (err) {
      setError(errorText(err, errors));
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {t.delete}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-bad/30 bg-bad/5 p-4">
      <FormError message={error} />
      <p className="font-medium">{t.deleteConfirm.replace("{name}", brand.name)}</p>
      <div className="flex gap-3">
        <Button variant="danger" loading={loading} onClick={remove}>
          {t.deleteYes}
        </Button>
        <Button variant="secondary" disabled={loading} onClick={() => setConfirming(false)}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}
