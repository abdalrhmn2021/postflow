"use client";

import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import type { Dictionary } from "@/i18n/dictionaries/ar";

type Props = {
  link: string;
  email: string;
  agencyName: string;
  t: Dictionary["team"];
};

// A new invite link, shown once (the database only keeps its hash): copy it, or send it on WhatsApp.
export function LinkBox({ link, email, agencyName, t }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access (old browser, not https): the link is selected in the box, ready for Ctrl+C.
      (document.getElementById("invite-link") as HTMLInputElement | null)?.select();
    }
  }

  const message = t.whatsappText.replace("{agency}", agencyName).replace("{link}", link);

  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-good/30 bg-good/5 p-4">
      {/* <bdi>: an English email inside an Arabic sentence keeps the words in order. */}
      <p className="font-medium">
        {t.linkReady.split("{email}")[0]}
        <bdi>{email}</bdi>
        {t.linkReady.split("{email}")[1]}
      </p>
      <input
        id="invite-link"
        readOnly
        value={link}
        dir="ltr"
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 w-full rounded-xl border border-line bg-card px-3.5 font-mono text-sm text-ink"
      />
      <div className="flex flex-wrap gap-3">
        <Button onClick={copy}>{copied ? t.copied : t.copy}</Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass("secondary")}
        >
          {t.whatsapp}
        </a>
      </div>
      <p className="text-sm text-muted">{t.linkHint}</p>
    </div>
  );
}
