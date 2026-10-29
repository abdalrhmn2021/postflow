"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { Role } from "@/lib/types";

type Props = {
  member: { id: string; name: string; role: Exclude<Role, "OWNER"> };
  t: Dictionary["team"];
  roles: Dictionary["dashboard"]["roles"];
  errors: Dictionary["errors"];
};

// The owner's controls on one staff member (never on the owner):
//   role      -> PATCH /api/staff/:id { role }, saved as soon as it's picked
//   remove    -> DELETE /api/staff/:id, after a second click to confirm
export function MemberActions({ member, t, roles, errors }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(request: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await request();
      router.refresh();
    } catch (err) {
      setError(errorText(err, errors));
    }
    setBusy(false);
  }

  const changeRole = (role: string) => run(() => api(`/staff/${member.id}`, { method: "PATCH", body: { role } }));
  const remove = () => run(() => api(`/staff/${member.id}`, { method: "DELETE" }));

  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor={`role-${member.id}`}>
          {t.role}
        </label>
        <select
          id={`role-${member.id}`}
          value={member.role}
          disabled={busy}
          onChange={(e) => changeRole(e.target.value)}
          className="h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink disabled:opacity-60"
        >
          <option value="EDITOR">{roles.EDITOR}</option>
          <option value="MANAGER">{roles.MANAGER}</option>
        </select>
        {!confirming && (
          <Button variant="secondary" className="h-9 px-3" disabled={busy} onClick={() => setConfirming(true)}>
            {t.remove}
          </Button>
        )}
      </div>
      {confirming && (
        <div className="flex flex-col gap-3 rounded-xl border border-bad/30 bg-bad/5 p-3">
          <p className="text-sm font-medium">{t.removeConfirm.replace("{name}", member.name)}</p>
          <div className="flex gap-3">
            <Button variant="danger" className="h-9 px-3" loading={busy} onClick={remove}>
              {t.removeYes}
            </Button>
            <Button variant="secondary" className="h-9 px-3" disabled={busy} onClick={() => setConfirming(false)}>
              {t.cancel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
