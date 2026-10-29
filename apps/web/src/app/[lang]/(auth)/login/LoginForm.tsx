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
import { nextPath } from "@/lib/next-path";
import type { Session } from "@/lib/types";

type Props = {
  locale: Locale;
  t: Dictionary["auth"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
};

// POST /api/auth/login. The API sets the login cookie; then we go where the visitor was heading.
// The fields are checked by the API (one set of rules, messages in our language), not by the browser.
export function LoginForm({ locale, t, errors, fields }: Props) {
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
      await api<Session>("/auth/login", {
        method: "POST",
        body: { email: data.get("email"), password: data.get("password") },
      });
      // ?next= is read here, at submit time, not with useSearchParams(): the page stays fully static.
      router.replace(nextPath(new URLSearchParams(window.location.search).get("next"), locale));
      router.refresh();
    } catch (err) {
      setFormError(errorText(err, errors));
      setFieldError(fieldErrors(err, fields));
      setLoading(false);
    }
  }

  return (
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
      <Input
        name="password"
        type="password"
        label={t.password}
        autoComplete="current-password"
        dir="ltr"
        error={fieldError.password}
      />
      <Button type="submit" loading={loading} className="mt-2">
        {t.loginSubmit}
      </Button>
    </form>
  );
}
