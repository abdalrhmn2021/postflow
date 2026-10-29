"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { CreatedInvite, Invite } from "@/lib/types";
import { LinkBox } from "./LinkBox";

type Props = {
  invite: Pick<Invite, "id" | "email" | "role">;
  agencyName: string;
  t: Dictionary["team"];
  errors: Dictionary["errors"];
};

// The owner's controls on one open invite:
//   new link -> POST /api/invites with the same email and role: a fresh link, 7 more days, the old one stops
//   cancel   -> DELETE /api/invites/:id: the link stops working
export function InviteActions({ invite, agencyName, t, errors }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"link" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  async function newLink() {
    setBusy("link");
    setError(null);
    try {
      const created = await api<CreatedInvite>("/invites", {
        method: "POST",
        body: { email: invite.email, role: invite.role },
      });
      setLink(created.link);
      router.refresh(); // its new expiry date
    } catch (err) {
      setError(errorText(err, errors));
    }
    setBusy(null);
  }

  async function cancel() {
    setBusy("cancel");
    setError(null);
    try {
      await api(`/invites/${invite.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError(errorText(err, errors));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" className="h-9 px-3" loading={busy === "link"} disabled={!!busy} onClick={newLink}>
          {t.newLink}
        </Button>
        <Button variant="secondary" className="h-9 px-3" loading={busy === "cancel"} disabled={!!busy} onClick={cancel}>
          {t.cancelInvite}
        </Button>
      </div>
      {link && <LinkBox link={link} email={invite.email} agencyName={agencyName} t={t} />}
    </div>
  );
}
