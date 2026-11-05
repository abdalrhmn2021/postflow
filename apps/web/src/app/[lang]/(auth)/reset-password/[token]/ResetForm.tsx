"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Input } from "@/components/ui/Input";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";
import type { Session } from "@/lib/types";

type Props = {
  locale: Locale;
  token: string;
  t: Dictionary["auth"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
};

// POST /api/auth/reset-password. The API sets the new password, logs out every other device,
// and logs this one in (the cookie) - so we go straight to the dashboard.
export function ResetForm({ locale, token, t, errors, fields }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setLoading(true);
    setFormError(null);
    setFieldError({});
    try {
      await api<Session>("/auth/reset-password", { method: "POST", body: { token, password } });
      router.replace(`/${locale}/dashboard`);
      router.refresh();
    } catch (err) {
      setFormError(errorText(err, errors)); // RESET_LINK_INVALID, VALIDATION_ERROR ...
      setFieldError(fieldErrors(err, fields));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
      <FormError message={formError} />
      <Input
        name="password"
        type="password"
        label={t.newPassword}
        hint={t.passwordHint}
        autoComplete="new-password"
        dir="ltr"
        error={fieldError.password}
        autoFocus
      />
      <p className="text-sm text-muted">{t.resetDone}</p>
      <Button type="submit" loading={loading} className="mt-2">
        {t.resetSubmit}
      </Button>
    </form>
  );
}
