import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession } from "@/lib/server-api";
import { brandOptions } from "../brand-options";
import { PostEditor } from "../PostEditor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).posts.newTitle };
}

type Search = Promise<{ brand?: string | string[]; at?: string | string[] }>;

// A new post. ?brand=<id> picks the client, ?at=2026-11-05T18:30 the time in that client's zone
// (the calendar, step 4, opens this page with both).
export default async function NewPostPage({ searchParams }: PageProps<"/[lang]/dashboard/posts/new">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/${locale}/dashboard/posts`} className="text-sm text-muted hover:text-ink">
        {dict.posts.back}
      </Link>
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-2xl bg-line/50" />}>
        <NewPost locale={locale} dict={dict} searchParams={searchParams as Search} />
      </Suspense>
    </div>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function NewPost({ locale, dict, searchParams }: { locale: Locale; dict: Dictionary; searchParams: Search }) {
  const [{ user }, brands, search] = await Promise.all([getSession(), brandOptions(locale), searchParams]);
  if (brands.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center text-muted">
        {dict.posts.noBrands}
      </p>
    );
  }
  const brand = one(search.brand);
  const at = one(search.at);
  return (
    <PostEditor
      locale={locale}
      t={dict.posts}
      errors={dict.errors}
      fields={dict.fields}
      role={user.role}
      brands={brands}
      initialBrandId={brands.some((b) => b.id === brand) ? brand : undefined}
      initialWhen={at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at) ? at : undefined}
    />
  );
}
