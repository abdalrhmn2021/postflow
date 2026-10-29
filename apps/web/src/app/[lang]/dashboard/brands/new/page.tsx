import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession } from "@/lib/server-api";
import { timezoneOptions } from "@/lib/timezones";
import { BrandForm } from "../BrandForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).brands.newTitle };
}

// Add a client. Owner only: anyone else is sent back to the list (the API would refuse anyway).
export default async function NewBrandPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.brands;
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href={`/${locale}/dashboard/brands`} className="text-sm text-muted hover:text-ink">
          {t.back}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{t.newTitle}</h1>
      </div>
      <section className="rounded-2xl border border-line bg-card p-6">
        <Suspense fallback={<div className="h-96" />}>
          <OwnerOnly>
            <BrandForm
              locale={locale}
              t={t}
              errors={dict.errors}
              fields={dict.fields}
              timezones={timezoneOptions(locale)}
            />
          </OwnerOnly>
        </Suspense>
      </section>
    </div>
  );
}

async function OwnerOnly({ children }: { children: ReactNode }) {
  const [locale, { user }] = await Promise.all([getLocale(), getSession()]);
  if (user.role !== "OWNER") redirect(`/${locale}/dashboard/brands`);
  return children;
}
