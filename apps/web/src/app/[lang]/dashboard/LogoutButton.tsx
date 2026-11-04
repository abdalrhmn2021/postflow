"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import { api } from "@/lib/api";

// POST /api/auth/logout removes the login cookie, then we go to the login page.
// Even if the call fails (network), we still leave: the person asked to log out.
// A full page load, not router.replace(): Next.js keeps visited pages (and this button's "loading")
// in memory, so after logging in again the button stayed disabled - and the next person on the
// computer could see the last one's pages from that memory. A new page load starts clean.
export function LogoutButton({ locale, label }: { locale: Locale; label: string }) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.replace(`/${locale}/login`);
  }

  return (
    <Button variant="secondary" loading={loading} onClick={logout} className="h-9 px-3">
      {label}
    </Button>
  );
}
