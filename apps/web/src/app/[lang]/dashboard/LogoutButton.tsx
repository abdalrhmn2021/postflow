"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import { api } from "@/lib/api";

// POST /api/auth/logout removes the login cookie, then we go to the login page.
// Even if the call fails (network), we still leave: the person asked to log out.
export function LogoutButton({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace(`/${locale}/login`);
    router.refresh();
  }

  return (
    <Button variant="secondary" loading={loading} onClick={logout} className="h-9 px-3">
      {label}
    </Button>
  );
}
