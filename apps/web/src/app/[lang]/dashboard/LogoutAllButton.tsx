"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/i18n/config";
import { api } from "@/lib/api";

type Props = { locale: Locale; label: string; confirmLabel: string };

// POST /api/auth/logout-all ends the person's login on every device (a lost phone, a shared
// computer), this one too, then we go to the login page. A second click confirms it.
export function LogoutAllButton({ locale, label, confirmLabel }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function logoutAll() {
    setLoading(true);
    try {
      await api("/auth/logout-all", { method: "POST" });
    } catch {
      // Already logged out (401) or the network: the login page shows where things stand.
    }
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={loading}
      aria-busy={loading || undefined}
      onClick={confirming ? logoutAll : () => setConfirming(true)}
      onBlur={() => setConfirming(false)}
      className={`text-xs hover:underline disabled:opacity-60 ${confirming ? "font-semibold text-bad" : "text-muted"}`}
    >
      {confirming ? confirmLabel : label}
    </button>
  );
}
