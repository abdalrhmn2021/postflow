import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import {
  calendarDays,
  dayKey,
  fetchRange,
  groupByDay,
  monthTitle,
  parseDay,
  shift,
  todayIn,
  weekStartsOn,
  weekTitle,
  type View,
} from "@/lib/calendar";
import { getSession, serverApi } from "@/lib/server-api";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import type { Brand, Post } from "@/lib/types";
import { toZonedInput } from "@/lib/zoned-time";
import { BrandFilter } from "./BrandFilter";
import { MonthView, WeekView } from "./CalendarViews";
import { NoBrands } from "./NoBrands";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).posts.title };
}

type Search = { view?: string | string[]; date?: string | string[]; brand?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// The posts calendar. The URL says what's on screen, so a refresh or a shared link opens the same place:
//   ?view=month|week   (month by default)
//   ?date=2026-11-05   (any day in the month / week; today by default)
//   ?brand=<id>        (one client; all by default)
// Every post sits on its day in its client's time zone. The API decides who sees which posts.
export default async function PostsPage({ searchParams }: PageProps<"/[lang]/dashboard/posts">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.posts;
  return (
    <div className="flex flex-col gap-6">
      <Suspense
        fallback={
          <>
            <Header title={t.title} subtitle={t.subtitle} />
            <div className="h-[36rem] animate-pulse rounded-2xl bg-line/50" />
          </>
        }
      >
        <Calendar locale={locale} t={t} searchParams={searchParams as Promise<Search>} />
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

async function Calendar({
  locale,
  t,
  searchParams,
}: {
  locale: Locale;
  t: Dictionary["posts"];
  searchParams: Promise<Search>;
}) {
  const [search, { user }, brands] = await Promise.all([searchParams, getSession(), serverApi<Brand[]>("/brands")]);
  if (brands.length === 0) {
    return (
      <>
        <Header title={t.title} subtitle={t.subtitle} />
        <NoBrands role={user.role} locale={locale} t={t} />
      </>
    );
  }

  const view: View = one(search.view) === "week" ? "week" : "month";
  const brand = brands.find((b) => b.id === one(search.brand)); // an unknown id = all clients
  // "Today" and the default new-post hour follow the chosen client's zone, else the region's.
  const zone = brand?.timezone ?? DEFAULT_TIMEZONE;
  await connection(); // "now" is the time of the request, not of the build
  const now = new Date();
  const today = todayIn(zone, now);
  const anchor = parseDay(one(search.date)) ?? parseDay(today)!;
  const days = calendarDays(view, anchor, weekStartsOn(locale));

  const brandQuery = brand ? `&brandId=${encodeURIComponent(brand.id)}` : "";
  const range = new URLSearchParams(fetchRange(days));
  const [posts, drafts] = await Promise.all([
    serverApi<Post[]>(`/posts?${range}${brandQuery}`),
    serverApi<Post[]>(`/posts/unscheduled${brand ? `?brandId=${encodeURIComponent(brand.id)}` : ""}`),
  ]);
  const byDay = groupByDay(posts, days);

  // Links that keep what's on screen and change one thing.
  const base = `/${locale}/dashboard/posts`;
  const href = (change: { view?: View; date?: string; brand?: string | null }) => {
    const q = new URLSearchParams();
    const v = change.view ?? view;
    if (v === "week") q.set("view", "week");
    const date = change.date ?? dayKey(anchor);
    if (date !== today) q.set("date", date);
    const b = change.brand === undefined ? brand?.id : change.brand;
    if (b) q.set("brand", b);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  // A new post on a day: 10:00 that day, or the next full hour if it's today.
  const nextHour = toZonedInput(new Date(now.getTime() + 60 * 60 * 1000).toISOString(), zone).slice(11, 13);
  const newHref = (day: string) => {
    const hour = day === today ? (nextHour === "00" ? null : `${nextHour}:00`) : "10:00";
    const q = new URLSearchParams();
    if (brand) q.set("brand", brand.id);
    if (hour) q.set("at", `${day}T${hour}`);
    const s = q.toString();
    return `${base}/new${s ? `?${s}` : ""}`;
  };
  const shared = {
    locale,
    t,
    days,
    byDay,
    today,
    postHref: (id: string) => `${base}/${id}`,
    newHref,
    weekHref: (day: string) => href({ view: "week", date: day }),
  };

  return (
    <>
      <Header
        title={t.title}
        subtitle={t.subtitle}
        action={
          <ButtonLink href={`${base}/new${brand ? `?brand=${encodeURIComponent(brand.id)}` : ""}`}>{t.add}</ButtonLink>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <NavButton href={href({ date: dayKey(shift(view, anchor, -1)) })} label={t.prev} direction="prev" />
          <Link
            href={href({ date: today })}
            className="h-10 rounded-xl border border-line bg-card px-3 text-sm leading-10 font-medium hover:border-accent"
          >
            {t.today}
          </Link>
          <NavButton href={href({ date: dayKey(shift(view, anchor, 1)) })} label={t.next} direction="next" />
        </div>
        <h2 className="text-lg font-semibold">
          {view === "month" ? monthTitle(anchor, locale) : weekTitle(days, locale)}
        </h2>

        <div className="ms-auto flex flex-wrap items-center gap-3">
          <BrandFilter
            label={t.brand}
            allLabel={t.allBrands}
            brands={brands.map(({ id, name }) => ({ id, name }))}
            value={brand?.id ?? ""}
            hrefFor={Object.fromEntries([
              ["", href({ brand: null })],
              ...brands.map((b) => [b.id, href({ brand: b.id })]),
            ])}
          />
          <div className="flex rounded-xl border border-line bg-card p-0.5 text-sm" role="group">
            {(["month", "week"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v })}
                aria-current={v === view ? "page" : undefined}
                className={
                  "rounded-[10px] px-3 py-1.5 font-medium transition-colors " +
                  (v === view ? "bg-brand text-on-brand" : "text-muted hover:text-ink")
                }
              >
                {t[v]}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {view === "month" ? <MonthView {...shared} month={anchor.getUTCMonth()} /> : <WeekView {...shared} />}
      <p className="-mt-3 text-xs text-muted">{t.zoneNote}</p>

      <Drafts title={t.unscheduled} empty={t.unscheduledEmpty} posts={drafts} t={t} base={base} />
    </>
  );
}

// Previous / next. The arrow turns with the page direction: in Arabic "previous" points right.
function NavButton({ href, label, direction }: { href: string; label: string; direction: "prev" | "next" }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-xl border border-line bg-card hover:border-accent"
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
        className={`size-4 ${direction === "prev" ? "rtl:rotate-180" : "ltr:rotate-180"}`}
      >
        <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

// Drafts that have no time yet: they can't sit on a day, so they wait here.
function Drafts({
  title,
  empty,
  posts,
  t,
  base,
}: {
  title: string;
  empty: string;
  posts: Post[];
  t: Dictionary["posts"];
  base: string;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card">
      <h2 className="border-b border-line px-6 py-4 text-lg font-semibold">{title}</h2>
      {posts.length === 0 ? (
        <p className="px-6 py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`${base}/${post.id}`}
                className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-surface"
              >
                <StatusBadge status={post.status} label={t.status[post.status]} />
                <span className="w-40 shrink-0 truncate font-medium">{post.brand.name}</span>
                <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-muted">
                  {post.caption.trim() || t.noCaption}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
