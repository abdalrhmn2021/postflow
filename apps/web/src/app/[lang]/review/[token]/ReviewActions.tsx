"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Textarea } from "@/components/ui/Textarea";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";
import type { ReviewPost } from "@/lib/types";

type Props = {
  token: string;
  post: Pick<ReviewPost, "id" | "approval" | "approvalNote">;
  t: Dictionary["review"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
};

// The client's answer to one post: approve, or ask for changes with a note (a note is required).
// Answered posts show what the client said; the agency sends a post again after changing it.
export function ReviewActions({ token, post, t, errors, fields }: Props) {
  const router = useRouter();
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"APPROVE" | "CHANGES" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();

  async function answer(decision: "APPROVE" | "CHANGES") {
    setBusy(decision);
    setError(null);
    setNoteError(undefined);
    try {
      await api(`/review/${encodeURIComponent(token)}/posts/${post.id}`, {
        method: "POST",
        body: decision === "APPROVE" ? { decision } : { decision, note },
      });
      router.refresh(); // the page moves the post to "answered"
    } catch (err) {
      setError(errorText(err, errors));
      setNoteError(fieldErrors(err, fields).note);
    }
    setBusy(null);
  }

  if (post.approval === "APPROVED") return <p className="font-medium text-good">{t.approved}</p>;
  if (post.approval === "CHANGES_REQUESTED") {
    return (
      <p className="text-sm">
        <span className="font-medium text-bad">{t.changesSent}</span>{" "}
        <span dir="auto" className="whitespace-pre-line">
          {post.approvalNote}
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      {writing ? (
        <>
          <Textarea
            name="note"
            label={t.requestChanges}
            placeholder={t.notePlaceholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={1000}
            dir="auto"
            autoFocus
            error={noteError}
          />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              loading={busy === "CHANGES"}
              disabled={busy !== null}
              onClick={() => answer("CHANGES")}
            >
              {t.sendChanges}
            </Button>
            <Button variant="secondary" disabled={busy !== null} onClick={() => setWriting(false)}>
              {t.cancel}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button loading={busy === "APPROVE"} disabled={busy !== null} onClick={() => answer("APPROVE")}>
            {t.approve}
          </Button>
          <Button variant="secondary" disabled={busy !== null} onClick={() => setWriting(true)}>
            {t.requestChanges}
          </Button>
        </div>
      )}
    </div>
  );
}
