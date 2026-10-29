import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession, serverApi } from "@/lib/server-api";
import { timezoneName, timezoneOptions } from "@/lib/timezones";
import type { Brand, StaffMember } from "@/lib/types";
import { BrandForm } from "../BrandForm";
import { DeleteBrand } from "./DeleteBrand";
import { EditorsForm } from "./EditorsForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).brands.details };
}

// One client. The owner edits it, picks its editors and can delete it; everyone else only reads.
// A client of another agency, or one an editor isn't on, is a 404 from the API -> the not-found page.
export default async function BrandPage({ params }: PageProps<"/[lang]/dashboard/brands/[id]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href={`/${locale}/dashboard/brands`} className="text-sm text-muted hover:text-ink">
        {dict.brands.back}
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-line/50" />}>
        <BrandDetails params={params} locale={locale} dict={dict} />
      </Suspense>
    </div>
  );
}

async function BrandDetails({
  params,
  locale,
  dict,
}: {
  params: Promise<{ id: string }>;
  locale: Locale;
  dict: Dictionary;
}) {
  const { id } = await params;
  const [{ user }, brand] = await Promise.all([getSession(), serverApi<Brand>(`/brands/${encodeURIComponent(id)}`)]);
  const t = dict.brands;

  if (user.role !== "OWNER") return <ReadOnly brand={brand} locale={locale} t={t} />;

  // The owner picks editors from everyone in the agency with the editor role.
  const staff = await serverApi<StaffMember[]>("/staff");
  const editors = staff.filter((s) => s.role === "EDITOR").map(({ id, name, email }) => ({ id, name, email }));

  return (
    <>
      <h1 className="text-2xl font-bold">{brand.name}</h1>

      <Section title={t.details}>
        <BrandForm
          locale={locale}
          t={t}
          errors={dict.errors}
          fields={dict.fields}
          timezones={timezoneOptions(locale, brand.timezone)}
          brand={brand}
        />
      </Section>

      <Section title={t.editorsTitle} hint={t.editorsHint}>
        <EditorsForm
          brandId={brand.id}
          editors={editors}
          assigned={brand.editors.map((e) => e.id)}
          t={t}
          errors={dict.errors}
        />
      </Section>

      <Section title={t.deleteTitle} hint={t.deleteHint}>
        <DeleteBrand locale={locale} brand={brand} t={t} errors={dict.errors} />
      </Section>
    </>
  );
}

// What managers and editors see: the same details, as text.
function ReadOnly({ brand, locale, t }: { brand: Brand; locale: Locale; t: Dictionary["brands"] }) {
  const rows: [string, string][] = [
    [t.language, t.languages[brand.language]],
    [t.timezone, timezoneName(brand.timezone, locale)],
    [t.voice, brand.voice ?? t.noVoice],
    [t.editorsTitle, brand.editors.map((e) => e.name).join(locale === "ar" ? "، " : ", ") || t.noEditors],
  ];
  return (
    <>
      <h1 className="text-2xl font-bold">{brand.name}</h1>
      <Section title={t.details}>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 sm:grid-cols-3">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="whitespace-pre-line sm:col-span-2">{value}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
