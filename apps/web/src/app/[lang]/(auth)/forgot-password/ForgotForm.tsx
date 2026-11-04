"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Input } from "@/components/ui/Input";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";

type Props = {
  locale: Locale;
  t: Dictionary["forgot"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
  email: string; // the field's label
};

// POST /api/auth/forgot-password { email, lang }. The API answers the same whether the email has an
// account or not, so the page does too: "if it has an account, we sent a link".
export function ForgotForm({ locale, t, errors, fields, email: emailLabel }: Props) {
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setLoading(true);
    setFormError(null);
    setFieldError({});
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email, lang: locale } });
      setSentTo(email);
    } catch (err) {
      setFormError(errorText(err, errors));
      setFieldError(fieldErrors(err, fields));
    } finally {
      setLoading(false);
    }
  }

  const back = (
    <p className="mt-6 text-center text-sm">
      <Link href={`/${locale}/login`} className="font-semibold text-brand hover:underline">
        {t.back}
      </Link>
    </p>
  );

  if (sentTo) {
    return (
      <>
        <h1 className="text-2xl font-bold">{t.sentTitle}</h1>
        <p className="mt-2 text-muted">
          {t.sentBody.split("{email}")[0]}
          <bdi className="font-medium text-ink">{sentTo}</bdi>
          {t.sentBody.split("{email}")[1]}
        </p>
        {back}
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 text-muted">{t.subtitle}</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <FormError message={formError} />
        <Input
          name="email"
          type="email"
          label={emailLabel}
          autoComplete="email"
          dir="ltr"
          error={fieldError.email}
          autoFocus
        />
        <Button type="submit" loading={loading} className="mt-2">
          {t.submit}
        </Button>
      </form>
      {back}
    </>
  );
}
