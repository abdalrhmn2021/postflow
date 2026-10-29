"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Input } from "@/components/ui/Input";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api, ApiError } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";
import type { Session } from "@/lib/types";

type Props = {
  locale: Locale;
  t: Dictionary["auth"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
};

// "Lamsa Media" -> "lamsa-media". Arabic letters drop out, so an Arabic name suggests nothing
// and the person types the link name themselves.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

// POST /api/auth/register: a new agency + its owner. The API logs them in straight away (cookie),
// so we go to the dashboard.
export function RegisterForm({ locale, t, errors, fields }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  // The link name follows the agency name until the person edits it themselves.
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setLoading(true);
    setFormError(null);
    setFieldError({});
    try {
      await api<Session>("/auth/register", {
        method: "POST",
        body: {
          agencyName: data.get("agencyName"),
          slug: data.get("slug"),
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
        },
      });
      router.replace(`/${locale}/dashboard`);
      router.refresh();
    } catch (err) {
      // SLUG_TAKEN / EMAIL_TAKEN belong to one field: say it under that field, not above the form.
      const code = err instanceof ApiError ? err.code : "";
      if (code === "SLUG_TAKEN") setFieldError({ slug: errors.SLUG_TAKEN });
      else if (code === "EMAIL_TAKEN") setFieldError({ email: errors.EMAIL_TAKEN });
      else {
        setFormError(errorText(err, errors));
        setFieldError(fieldErrors(err, fields));
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
      <FormError message={formError} />
      <Input
        name="agencyName"
        label={t.agencyName}
        autoComplete="organization"
        error={fieldError.agencyName}
        onChange={(e) => {
          if (!slugEdited) setSlug(slugify(e.target.value));
        }}
        autoFocus
      />
      <Input
        name="slug"
        label={t.slug}
        dir="ltr"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={t.slugPlaceholder}
        value={slug}
        onChange={(e) => {
          setSlug(e.target.value.toLowerCase());
          setSlugEdited(true);
        }}
        error={fieldError.slug}
        hint={t.slugHint.replace("{slug}", slug || t.slugPlaceholder)}
      />
      <Input name="name" label={t.name} autoComplete="name" error={fieldError.name} />
      <Input name="email" type="email" label={t.email} autoComplete="email" dir="ltr" error={fieldError.email} />
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
        {t.registerSubmit}
      </Button>
    </form>
  );
}
