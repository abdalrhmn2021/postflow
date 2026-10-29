import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession, serverApi } from "@/lib/server-api";
import { timezoneName } from "@/lib/timezones";
import type { Brand } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).brands.title };
}

// The agency's clients. The API decides who sees which: the owner and managers every client,
// an editor only the ones they're on. Only the owner adds clients.
export default async function BrandsPage() {
  const t = (await getDictionary()).brands;
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Header title={t.title} subtitle={t.subtitle} />}>
        <BrandList />
      </Suspense>
    </div>
  );
}

function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

async function BrandList() {
  const [locale, dict, { user }, brands] = await Promise.all([
    getLocale(),
    getDictionary(),
    getSession(),
    serverApi<Brand[]>("/brands"),
  ]);
  const t = dict.brands;
  const isOwner = user.role === "OWNER";

  return (
    <>
      <Header
        title={t.title}
        subtitle={t.subtitle}
        action={isOwner && <ButtonLink href={`/${locale}/dashboard/brands/new`}>{t.add}</ButtonLink>}
      />

      {brands.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center text-muted">
          {isOwner ? t.emptyOwner : t.emptyOther}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <li key={brand.id}>
              <Link
                href={`/${locale}/dashboard/brands/${brand.id}`}
                className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-card p-5 transition-colors hover:border-accent"
              >
                <span className="text-lg font-semibold">{brand.name}</span>
                <span className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-surface px-2.5 py-1">{t.languages[brand.language]}</span>
                  <span className="rounded-full bg-surface px-2.5 py-1">{timezoneName(brand.timezone, locale)}</span>
                </span>
                <span className="mt-auto text-sm text-muted">
                  {brand.editors.length === 0
                    ? t.noEditors
                    : t.editorsCount.replace("{n}", String(brand.editors.length))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
