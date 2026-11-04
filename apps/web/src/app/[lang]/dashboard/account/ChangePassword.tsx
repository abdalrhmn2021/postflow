"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Input } from "@/components/ui/Input";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";

type Props = { t: Dictionary["account"]; hint: string; errors: Dictionary["errors"]; fields: Dictionary["fields"] };

// POST /api/auth/change-password { currentPassword, newPassword }. This browser stays logged in,
// the other devices are logged out.
export function ChangePassword({ t, hint, errors, fields }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setDone(false);
    setFormError(null);
    setFieldError({});
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: { currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") },
      });
      form.reset();
      setDone(true);
    } catch (err) {
      setFormError(errorText(err, errors));
      setFieldError(fieldErrors(err, fields));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <p className="font-medium">{t.passwordTitle}</p>
        <p className="mt-1 text-sm text-muted">{t.passwordHint}</p>
      </div>
      <FormError message={formError} />
      {done && (
        <p role="status" className="text-sm font-medium text-good">
          {t.passwordChanged}
        </p>
      )}
      <Input
        name="currentPassword"
        type="password"
        label={t.currentPassword}
        autoComplete="current-password"
        dir="ltr"
        error={fieldError.currentPassword}
      />
      <Input
        name="newPassword"
        type="password"
        label={t.newPassword}
        autoComplete="new-password"
        dir="ltr"
        hint={hint}
        error={fieldError.newPassword}
      />
      <div>
        <Button type="submit" loading={loading}>
          {t.changePassword}
        </Button>
      </div>
    </form>
  );
}
