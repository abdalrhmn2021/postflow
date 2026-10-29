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
  email: string; // fixed by the invite: the account is made for this email
  t: Dictionary["invite"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
};

// POST /api/invites/accept { token, name, password } -> the account is made, the link stops working,
// and the API logs them in (cookie) - so we go straight to the dashboard.
export function AcceptForm({ locale, token, email, t, errors, fields }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setFormError(null);
    setFieldError({});
    try {
      await api<Session>("/invites/accept", {
        method: "POST",
        body: { token, name: data.get("name"), password: data.get("password") },
      });
      router.replace(`/${locale}/dashboard`);
      router.refresh();
    } catch (err) {
      setFormError(errorText(err, errors)); // INVITE_INVALID, EMAIL_TAKEN, VALIDATION_ERROR ...
      setFieldError(fieldErrors(err, fields));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
      <FormError message={formError} />
      <Input name="email" label={t.email} value={email} readOnly disabled dir="ltr" />
      <Input name="name" label={t.name} autoComplete="name" error={fieldError.name} autoFocus />
      <Input
        name="password"
        type="password"
        label={t.password}
        autoComplete="new-password"
        dir="ltr"
        error={fieldError.password}
        hint={t.passwordHint}
      />
      <Button type="submit" loading={loading} className="mt-2">
        {t.submit}
      </Button>
    </form>
  );
}
