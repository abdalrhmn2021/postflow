"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { Approval, Post } from "@/lib/types";

const tone: Record<Approval, string> = {
  NONE: "bg-line/60 text-muted",
  PENDING: "bg-accent/20 text-ink",
  APPROVED: "bg-good/15 text-good",
  CHANGES_REQUESTED: "bg-bad/15 text-bad",
};

type Props = {
  t: Dictionary["approval"];
  post: Pick<Post, "status" | "approval" | "approvalNote" | "brand">;
  canSend: boolean; // the post can be changed by this user, and isn't scheduled
  busy: boolean;
  onSend: () => void; // saves what's on screen, then sends it to the client
};

// Where the client's approval stands, their note when they asked for changes, and the button that
// sends the post to them. Shown for every client that requires approval, and for any post already
// sent (a client without the setting can still be asked).
export function ApprovalBar({ t, post, canSend, busy, onSend }: Props) {
  const [sent, setSent] = useState(false);
  if (!post.brand.requiresApproval && post.approval === "NONE") {
    return canSend ? (
      <button
        type="button"
        onClick={onSend}
        disabled={busy}
        className="self-start text-sm text-muted underline hover:text-ink"
      >
        {t.send}
      </button>
    ) : null;
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{t.title}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone[post.approval]}`}>
          {t[post.approval]}
        </span>
      </div>
      {post.approval === "CHANGES_REQUESTED" && post.approvalNote && (
        <p className="rounded-lg bg-card px-3 py-2 text-sm">
          <span className="font-medium">{t.clientNote}</span>{" "}
          <span dir="auto" className="whitespace-pre-line">
            {post.approvalNote}
          </span>
        </p>
      )}
      {post.brand.requiresApproval && post.approval !== "APPROVED" && (
        <p className="text-xs text-muted">{t.required}</p>
      )}
      {post.approval === "APPROVED" && <p className="text-xs text-muted">{t.resetHint}</p>}
      {canSend && post.approval !== "PENDING" && post.approval !== "APPROVED" && (
        <Button
          variant="secondary"
          className="self-start"
          loading={busy}
          onClick={() => {
            setSent(true);
            onSend();
          }}
        >
          {post.approval === "CHANGES_REQUESTED" ? t.sendAgain : t.send}
        </Button>
      )}
      {sent && post.approval === "PENDING" && (
        <p role="status" className="text-sm text-good">
          {t.sent}
        </p>
      )}
    </section>
  );
}
