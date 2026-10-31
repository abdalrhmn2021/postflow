import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { serverApi } from "@/lib/server-api";
import type { Brand, Post } from "@/lib/types";
import { formatInZone } from "@/lib/zoned-time";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).posts.title };
}

const DAYS_AHEAD = 60; // the API answers at most 62 days per request

// The posts, as a list for now: what's coming up in the next 60 days, and the drafts that have no time.
// The calendar (step 4) takes this page's place. The API decides who sees which posts.
export default async function PostsPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.posts;
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Header title={t.title} subtitle={t.subtitle} />}>
        <PostLists locale={locale} t={t} />
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

async function PostLists({ locale, t }: { locale: Locale; t: Dictionary["posts"] }) {
  await connection(); // "now" is the time of the request, not of the build
  const from = new Date();
  const to = new Date(from.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const range = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });

  const [brands, upcoming, unscheduled] = await Promise.all([
    serverApi<Brand[]>("/brands"),
    serverApi<Post[]>(`/posts?${range}`),
    serverApi<Post[]>("/posts/unscheduled"),
  ]);

  if (brands.length === 0) {
    return (
      <>
        <Header title={t.title} subtitle={t.subtitle} />
        <p className="rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center text-muted">
          {t.noBrands}
        </p>
      </>
    );
  }

  return (
    <>
      <Header
        title={t.title}
        subtitle={t.subtitle}
        action={<ButtonLink href={`/${locale}/dashboard/posts/new`}>{t.add}</ButtonLink>}
      />
      <Section title={t.upcoming} empty={t.upcomingEmpty} posts={upcoming} locale={locale} t={t} />
      <Section title={t.unscheduled} empty={t.unscheduledEmpty} posts={unscheduled} locale={locale} t={t} />
    </>
  );
}

function Section(props: { title: string; empty: string; posts: Post[]; locale: Locale; t: Dictionary["posts"] }) {
  const { title, empty, posts, locale, t } = props;
  return (
    <section className="rounded-2xl border border-line bg-card">
      <h2 className="border-b border-line px-6 py-4 text-lg font-semibold">{title}</h2>
      {posts.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/${locale}/dashboard/posts/${post.id}`}
                className="flex flex-col gap-2 px-6 py-4 transition-colors hover:bg-surface sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-56">
                  <StatusBadge status={post.status} label={t.status[post.status]} />
                  {post.scheduledAt && (
                    // In the brand's zone: the time the post goes out for its audience.
                    <span className="text-sm text-muted">
                      {formatInZone(post.scheduledAt, post.brand.timezone, locale)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{post.brand.name}</p>
                  <p dir="auto" className="truncate text-sm text-muted">
                    {post.caption.trim() || t.noCaption}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5 text-xs text-muted">
                  {post.platforms.map((p) => (
                    <span key={p} className="rounded-full bg-surface px-2 py-0.5">
                      {t.platformNames[p]}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
