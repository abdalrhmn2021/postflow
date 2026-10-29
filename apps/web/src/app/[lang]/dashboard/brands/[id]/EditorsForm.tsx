"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { Brand } from "@/lib/types";

type Props = {
  brandId: string;
  editors: { id: string; name: string; email: string }[]; // every editor in the agency
  assigned: string[]; // the ones on this brand now
  t: Dictionary["brands"];
  errors: Dictionary["errors"];
};

// Which editors work on this client. Saving sends the whole list: PUT /api/brands/:id/editors.
export function EditorsForm({ brandId, editors, assigned, t, errors }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(assigned));
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSaved(false);
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setLoading(true);
    setSaved(false);
    setError(null);
    try {
      await api<Brand>(`/brands/${brandId}/editors`, { method: "PUT", body: { userIds: [...selected] } });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(errorText(err, errors));
    }
    setLoading(false);
  }

  if (editors.length === 0) return <p className="text-sm text-muted">{t.noAgencyEditors}</p>;

  return (
    <div className="flex flex-col gap-4">
      <FormError message={error} />
      <ul className="divide-y divide-line rounded-xl border border-line">
        {editors.map((editor) => (
          <li key={editor.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={selected.has(editor.id)}
                onChange={() => toggle(editor.id)}
                className="size-4 accent-brand"
              />
              <span className="flex flex-col">
                <span className="font-medium">{editor.name}</span>
                <span className="text-sm text-muted" dir="ltr">
                  {editor.email}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-4">
        <Button onClick={save} loading={loading} variant="secondary">
          {t.saveEditors}
        </Button>
        {saved && (
          <p role="status" className="text-sm text-good">
            {t.editorsSaved}
          </p>
        )}
      </div>
    </div>
  );
}
