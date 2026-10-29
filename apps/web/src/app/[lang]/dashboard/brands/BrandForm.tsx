"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api, ApiError } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import type { Brand } from "@/lib/types";

type Props = {
  locale: Locale;
  t: Dictionary["brands"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
  timezones: { value: string; label: string }[];
  brand?: Brand; // given: edit this brand (PATCH); not given: a new one (POST)
};

// A client's details: name, post language, time zone, writing voice. Owner only (the API checks too).
// New  -> POST /api/brands, then the new client's page (to choose its editors).
// Edit -> PATCH /api/brands/:id, then the page re-reads the brand (router.refresh()).
export function BrandForm({ locale, t, errors, fields, timezones, brand }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      name: data.get("name"),
      language: data.get("language"),
      timezone: data.get("timezone"),
      voice: data.get("voice"), // "" is saved as "no voice"
    };
    setLoading(true);
    setSaved(false);
    setFormError(null);
    setFieldError({});
    try {
      if (brand) {
        await api<Brand>(`/brands/${brand.id}`, { method: "PATCH", body });
        setSaved(true);
        router.refresh();
      } else {
        const created = await api<Brand>("/brands", { method: "POST", body });
        router.push(`/${locale}/dashboard/brands/${created.id}`);
        router.refresh();
        return; // stay "loading" until the new page opens
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "BRAND_NAME_TAKEN") {
        setFieldError({ name: errors.BRAND_NAME_TAKEN });
      } else {
        setFormError(errorText(err, errors));
        setFieldError(fieldErrors(err, fields));
      }
    }
    setLoading(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" onChange={() => setSaved(false)}>
      <FormError message={formError} />
      <Input
        name="name"
        label={t.name}
        placeholder={t.namePlaceholder}
        defaultValue={brand?.name}
        error={fieldError.name}
        autoFocus={!brand}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          name="language"
          label={t.language}
          defaultValue={brand?.language ?? locale}
          options={[
            { value: "ar", label: t.languages.ar },
            { value: "en", label: t.languages.en },
          ]}
          error={fieldError.language}
        />
        <Select
          name="timezone"
          label={t.timezone}
          defaultValue={brand?.timezone ?? DEFAULT_TIMEZONE}
          options={timezones}
          error={fieldError.timezone}
          hint={t.timezoneHint}
        />
      </div>
      <Textarea
        name="voice"
        label={t.voice}
        placeholder={t.voicePlaceholder}
        defaultValue={brand?.voice ?? ""}
        maxLength={1000}
        error={fieldError.voice}
        hint={t.voiceHint}
      />
      <div className="flex items-center gap-4">
        <Button type="submit" loading={loading}>
          {brand ? t.save : t.create}
        </Button>
        {saved && (
          <p role="status" className="text-sm text-good">
            {t.saved}
          </p>
        )}
      </div>
    </form>
  );
}
