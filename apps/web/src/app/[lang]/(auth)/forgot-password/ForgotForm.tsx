"use client";

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
  t: Dictionary["auth"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
};

// POST /api/auth/forgot-password. The API answers the same whether the email has an account or not,
// so the page says "if there's an account, a link is on its way" - never "no such email".
export function ForgotForm({ locale, t, errors, fields }: Props) {
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setLoading(true);
    setFormError(null);
    setFieldError({});
    try {
      await api("/auth/forgot-password", { method: "POST", body: { email, lang: locale } });
      setSentTo(email.trim());
    } catch (err) {
      setFormError(errorText(err, errors)); // TOO_MANY_EMAILS, VALIDATION_ERROR ...
      setFieldError(fieldErrors(err, fields));
    }
    setLoading(false);
  }

  if (sentTo) {
    return (
      <>
        <h1 className="text-2xl font-bold">{t.forgotSentTitle}</h1>
        <p className="mt-2 leading-relaxed text-muted">
          {t.forgotSentBody.split("{email}").map((part, i) =>
            i === 0 ? (
              part
            ) : (
              <span key={i}>
                <bdi className="font-semibold text-ink">{sentTo}</bdi>
                {part}
              </span>
            ),
          )}
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t.forgotTitle}</h1>
      <p className="mt-1 text-muted">{t.forgotSubtitle}</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <FormError message={formError} />
        <Input
          name="email"
          type="email"
          label={t.email}
          autoComplete="email"
          dir="ltr"
          error={fieldError.email}
          autoFocus
        />
        <Button type="submit" loading={loading} className="mt-2">
          {t.forgotSubmit}
        </Button>
      </form>
    </>
  );
}
