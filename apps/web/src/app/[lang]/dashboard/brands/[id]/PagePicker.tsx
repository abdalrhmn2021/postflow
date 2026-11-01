"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { MetaPageChoice } from "@/lib/types";
import { AccountAvatar } from "./AccountAvatar";

type Props = {
  locale: Locale;
  brandId: string;
  pick: string; // ?meta=<pick> - the list Facebook's login brought back, kept 15 minutes by the API
  t: Dictionary["accounts"];
  errors: Dictionary["errors"];
};

// After Facebook's login: the pages the owner manages, to choose this client's page.
// A page another client already has is shown but can't be picked.
export function PagePicker({ locale, brandId, pick, t, errors }: Props) {
  const router = useRouter();
  const [pages, setPages] = useState<MetaPageChoice[] | null>(null);
  const [chosen, setChosen] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const here = `/${locale}/dashboard/brands/${brandId}`;

  useEffect(() => {
    const controller = new AbortController();
    api<MetaPageChoice[]>(`/brands/${brandId}/meta/pages/${encodeURIComponent(pick)}`, { signal: controller.signal })
      .then((list) => {
        setPages(list);
        setChosen(list.find((p) => !p.takenBy)?.id ?? "");
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorText(err, errors));
      });
    return () => controller.abort();
  }, [brandId, pick, errors]);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      await api(`/brands/${brandId}/meta`, { method: "PUT", body: { pick, pageId: chosen } });
      router.replace(`${here}?meta_done=1`); // the page again, without the used list in the URL
      router.refresh();
    } catch (err) {
      setError(errorText(err, errors));
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-semibold">{t.pick}</h3>
        <p className="text-sm text-muted">{t.pickHint}</p>
      </div>
      <FormError message={error} />

      {pages === null && !error && <div className="h-32 animate-pulse rounded-xl bg-line/50" />}

      {pages && (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t.pick}</legend>
          {pages.map((page) => {
            const taken = Boolean(page.takenBy);
            return (
              <label
                key={page.id}
                className={
                  "flex items-center gap-3 rounded-xl border p-3 transition-colors " +
                  (taken
                    ? "cursor-not-allowed border-line opacity-60"
                    : chosen === page.id
                      ? "cursor-pointer border-brand bg-brand/5"
                      : "cursor-pointer border-line hover:border-accent")
                }
              >
                <input
                  type="radio"
                  name="page"
                  value={page.id}
                  checked={chosen === page.id}
                  disabled={taken}
                  onChange={() => setChosen(page.id)}
                  className="accent-brand"
                />
                <AccountAvatar src={page.picture} name={page.name} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{page.name}</span>
                  <span className="truncate text-xs text-muted">
                    {page.takenBy
                      ? t.takenBy.replace("{name}", page.takenBy)
                      : page.instagram
                        ? `${t.instagram}: @${page.instagram.username ?? page.instagram.id}`
                        : t.noInstagram}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-3">
        {pages && pages.length > 0 && (
          <Button loading={loading} disabled={!chosen} onClick={connect}>
            {t.pickConnect}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => {
            router.replace(here);
            router.refresh();
          }}
        >
          {t.pickCancel}
        </Button>
      </div>
    </div>
  );
}
