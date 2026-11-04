"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, buttonClass } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Input } from "@/components/ui/Input";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { ApiError, api } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";

type Props = {
  locale: Locale;
  token: string;
  t: Dictionary["reset"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
  hint: string;
};

// POST /api/auth/reset-password { token, password }. Then every login of the person has ended,
// so they log in again with the new password.
export function ResetForm({ locale, token, t, errors, fields, hint }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [linkBad, setLinkBad] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    setLoading(true);
    setFormError(null);
    setFieldError({});
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setFormError(errorText(err, errors));
      setFieldError(fieldErrors(err, fields));
      setLinkBad(err instanceof ApiError && err.code === "RESET_LINK_INVALID");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <>
        <h1 className="text-2xl font-bold">{t.doneTitle}</h1>
        <p className="mt-2 text-muted">{t.doneBody}</p>
        <Link href={`/${locale}/login`} className={buttonClass("primary", "mt-6 w-full")}>
          {t.login}
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 text-muted">{t.subtitle}</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <FormError message={formError} />
        {linkBad && (
          <Link href={`/${locale}/forgot-password`} className="text-sm font-semibold text-brand hover:underline">
            {t.newLink}
          </Link>
        )}
        <Input
          name="password"
          type="password"
          label={t.password}
          autoComplete="new-password"
          dir="ltr"
          hint={hint}
          error={fieldError.password}
          autoFocus
        />
        <Button type="submit" loading={loading} className="mt-2">
          {t.submit}
        </Button>
      </form>
    </>
  );
}
