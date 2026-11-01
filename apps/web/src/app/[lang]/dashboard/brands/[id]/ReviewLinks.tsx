"use client";

import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";

type Props = {
  locale: Locale;
  brand: { id: string; name: string; language: "ar" | "en" };
  agencyName: string;
  t: Dictionary["approval"];
  errors: Dictionary["errors"];
};

// Make a review link for the client (owner and managers), copy it or send it on WhatsApp.
// The link is shown once: the API keeps only its hash. "Stop" ends every link of this client.
export function ReviewLinks({ brand, agencyName, t, errors }: Props) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState<"make" | "stop" | null>(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "make" | "stop") {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      if (action === "make") {
        // The page opens in the client's language, not the agency's.
        const res = await api<{ link: string }>(`/brands/${brand.id}/review-link?lang=${brand.language}`, {
          method: "POST",
        });
        setLink(res.link);
      } else {
        await api(`/brands/${brand.id}/review-link`, { method: "DELETE" });
        setLink(null);
        setNotice(t.stopped);
      }
    } catch (err) {
      setError(errorText(err, errors));
    }
    setBusy(null);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      (document.getElementById("review-link") as HTMLInputElement | null)?.select();
    }
  }

  const message = t.whatsappText
    .replace("{brand}", brand.name)
    .replace("{agency}", agencyName)
    .replace("{link}", link ?? "");

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      {link ? (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-good/30 bg-good/5 p-4">
          <p className="font-medium">{t.linkReady}</p>
          <input
            id="review-link"
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
        </div>
      ) : (
        <Button className="self-start" loading={busy === "make"} disabled={busy !== null} onClick={() => run("make")}>
          {t.makeLink}
        </Button>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("stop")}
          className="text-sm text-muted underline hover:text-bad disabled:opacity-50"
        >
          {t.stopLinks}
        </button>
        {notice && (
          <p role="status" className="text-sm text-good">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
