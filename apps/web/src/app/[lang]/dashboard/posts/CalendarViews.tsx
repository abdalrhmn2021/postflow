import Link from "next/link";
import { StatusBadge, statusDots, statusMarks } from "@/components/StatusBadge";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { dayKey, dayTitle, weekdayNames, type Slot } from "@/lib/calendar";

// The two calendar views. Server Components: plain links, no JavaScript in the browser.
// Each post is a link to its editor; each day that hasn't passed has a "+" to write a post for it.

type Shared = {
  locale: Locale;
  t: Dictionary["posts"];
  days: Date[];
  byDay: Map<string, Slot[]>;
  today: string; // "2026-11-05"
  postHref: (id: string) => string;
  newHref: (day: string) => string; // a new post on that day
  weekHref: (day: string) => string; // the week view around that day (for "+3 more")
};

const VISIBLE_IN_MONTH = 3;

export function MonthView({
  locale,
  t,
  days,
  byDay,
  today,
  postHref,
  newHref,
  weekHref,
  month,
}: Shared & { month: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card">
      <div className="grid grid-cols-7 border-b border-line bg-surface/60 text-center text-xs font-medium text-muted">
        {weekdayNames(days, locale).map((name, i) => (
          <div key={name} className="py-2">
            <span className="hidden sm:inline">{name}</span>
            <span className="sm:hidden">{weekdayNames(days, locale, "narrow")[i]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key = dayKey(day);
          const slots = byDay.get(key) ?? [];
          const inMonth = day.getUTCMonth() === month;
          const past = key < today;
          const label = t.newOnDay.replace("{day}", dayTitle(day, locale));
          return (
            <div
              key={key}
              className={
                "group flex min-h-20 flex-col gap-1 border-line p-1.5 sm:min-h-28 " +
                (i % 7 !== 6 ? "border-e " : "") +
                (i < 35 ? "border-b " : "") +
                (inMonth ? "" : "bg-surface/50 ")
              }
            >
              <div className="flex items-center justify-between">
                <DayNumber day={day} isToday={key === today} dim={!inMonth} />
                {!past && (
                  <Link
                    href={newHref(key)}
                    aria-label={label}
                    title={label}
                    className="grid size-6 place-items-center rounded-md text-muted transition hover:bg-brand hover:text-on-brand focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    +
                  </Link>
                )}
              </div>

              {/* Phones: the month is too narrow for text - a count, which opens the week. */}
              {slots.length > 0 && (
                <Link
                  href={weekHref(key)}
                  className="self-start rounded-full bg-brand/15 px-2 text-xs font-semibold text-brand sm:hidden"
                >
                  {slots.length}
                </Link>
              )}

              <ul className="hidden flex-col gap-1 sm:flex">
                {slots.slice(0, VISIBLE_IN_MONTH).map(({ post, time }) => (
                  <li key={post.id}>
                    <Link
                      href={postHref(post.id)}
                      title={`${time} · ${post.brand.name} · ${t.status[post.status]}`}
                      className="flex items-center gap-1.5 rounded-md bg-surface px-1.5 py-0.5 text-xs hover:bg-line/60"
                    >
                      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${statusDots[post.status]}`} />
                      <span className="shrink-0 font-semibold tabular-nums">{time}</span>
                      <span className="truncate">{post.brand.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {slots.length > VISIBLE_IN_MONTH && (
                <Link href={weekHref(key)} className="hidden px-1 text-xs text-muted hover:text-ink sm:block">
                  {t.more.replace("{n}", String(slots.length - VISIBLE_IN_MONTH))}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WeekView({ locale, t, days, byDay, today, postHref, newHref }: Shared) {
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {days.map((day) => {
        const key = dayKey(day);
        const slots = byDay.get(key) ?? [];
        const isToday = key === today;
        const past = key < today;
        return (
          <section
            key={key}
            className={
              "flex flex-col gap-2 rounded-2xl border bg-card p-2.5 lg:min-h-80 " +
              (isToday ? "border-brand" : "border-line")
            }
          >
            <h3 className={`px-1 text-sm font-semibold ${isToday ? "text-brand" : past ? "text-muted" : ""}`}>
              {dayTitle(day, locale)}
            </h3>
            {slots.length === 0 && <p className="px-1 text-xs text-muted lg:hidden">{t.dayEmpty}</p>}
            <ul className="flex flex-col gap-2">
              {slots.map(({ post, time }) => (
                <li key={post.id}>
                  <Link
                    href={postHref(post.id)}
                    className={`flex flex-col gap-1.5 rounded-xl border border-line border-s-[3px] p-2.5 text-sm transition-colors hover:bg-surface ${statusMarks[post.status]}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold tabular-nums">{time}</span>
                      <StatusBadge status={post.status} label={t.status[post.status]} />
                    </span>
                    <span className="truncate font-medium">{post.brand.name}</span>
                    <span dir="auto" className="line-clamp-3 text-xs break-words text-muted">
                      {post.caption.trim() || t.noCaption}
                    </span>
                    <span className="flex flex-wrap gap-1 text-[11px] text-muted">
                      {post.platforms.map((p) => (
                        <span key={p} className="rounded-full bg-surface px-1.5">
                          {t.platformNames[p]}
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {!past && (
              <Link
                href={newHref(key)}
                aria-label={t.newOnDay.replace("{day}", dayTitle(day, locale))}
                className="mt-auto rounded-xl border border-dashed border-line py-1.5 text-center text-xs text-muted transition-colors hover:border-brand hover:text-brand"
              >
                + {t.addHere}
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayNumber({ day, isToday, dim }: { day: Date; isToday: boolean; dim: boolean }) {
  return (
    <span
      className={
        "grid size-6 place-items-center rounded-full text-xs tabular-nums " +
        (isToday ? "bg-brand font-bold text-on-brand" : dim ? "text-muted" : "font-medium")
      }
    >
      {day.getUTCDate()}
    </span>
  );
}
