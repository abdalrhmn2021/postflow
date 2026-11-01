"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Textarea } from "@/components/ui/Textarea";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";
import type { Platform } from "@/lib/types";

type Props = {
  t: Dictionary["ai"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
  brandId: string;
  platforms: Platform[];
  caption: string; // what's written so far: can be sent to be improved
  onUse: (caption: string) => void; // puts the chosen idea in the post's text
};

// "Write me a caption": the idea in a few words -> three captions in the client's language and voice
// (POST /api/ai/captions). Nothing is saved until the person picks one and saves the post.
export function CaptionAssistant({ t, errors, fields, brandId, platforms, caption, onUse }: Props) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [improve, setImprove] = useState(false);
  const [ideas, setIdeas] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | undefined>();
  const [used, setUsed] = useState(false);

  async function suggest() {
    setLoading(true);
    setError(null);
    setBriefError(undefined);
    setUsed(false);
    try {
      const res = await api<{ ideas: string[] }>("/ai/captions", {
        method: "POST",
        body: { brandId, brief, platforms, current: improve && caption.trim() ? caption : null },
      });
      setIdeas(res.ideas);
    } catch (err) {
      setError(errorText(err, errors));
      setBriefError(fieldErrors(err, fields).brief);
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded-lg px-2 py-1 text-sm font-medium text-brand hover:bg-brand/10"
      >
        {t.open}
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{t.title}</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-ink">
          {t.close}
        </button>
      </div>
      <FormError message={error} />
      <Textarea
        name="brief"
        label={t.brief}
        placeholder={t.briefPlaceholder}
        hint={t.briefHint}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={2}
        maxLength={500}
        dir="auto"
        error={briefError}
      />
      {caption.trim() && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={improve}
            onChange={(e) => setImprove(e.target.checked)}
            className="size-4 accent-brand"
          />
          {t.improve}
        </label>
      )}
      <Button
        variant={ideas.length ? "secondary" : "primary"}
        className="self-start"
        loading={loading}
        disabled={brief.trim().length < 3}
        onClick={suggest}
      >
        {ideas.length ? t.again : t.write}
      </Button>

      {ideas.length > 0 && (
        <ol className="flex flex-col gap-2" aria-live="polite">
          {ideas.map((idea, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-card p-3">
              <p dir="auto" className="text-sm break-words whitespace-pre-wrap">
                {idea}
              </p>
              <Button
                variant="secondary"
                className="h-9 self-start px-3"
                onClick={() => {
                  onUse(idea);
                  setUsed(true);
                }}
              >
                {t.use}
              </Button>
            </li>
          ))}
        </ol>
      )}
      {used && (
        <p role="status" className="text-sm text-good">
          {t.used}
        </p>
      )}
      <p className="text-xs text-muted">{t.note}</p>
    </section>
  );
}
