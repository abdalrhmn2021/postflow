// The calendar's dates. A calendar day is a plain date ("2026-11-05"), kept as a Date at UTC midnight,
// so the machine's own time zone never moves a day. Which day a post falls on is decided in its
// brand's zone (postSlot), the same zone the editor shows. Safe anywhere (server and client).
import type { Locale } from "@/i18n/config";
import type { Post } from "./types";
import { toZonedInput } from "./zoned-time";

export type View = "month" | "week";

const DAY = 24 * 60 * 60 * 1000;

// "2026-11-05"
export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

// "2026-11-05" -> that date; null for anything else, including impossible dates (2026-02-30).
export function parseDay(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && dayKey(day) === value ? day : null;
}

export function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * DAY);
}

// The first day of a week: Saturday in Arabic (as in Palestine and most of the region), Monday in English.
export function weekStartsOn(locale: Locale): number {
  return locale === "ar" ? 6 : 1; // 0 = Sunday ... 6 = Saturday
}

export function startOfWeek(day: Date, firstDay: number): Date {
  return addDays(day, -((day.getUTCDay() - firstDay + 7) % 7));
}

// The days on screen: a month is always 6 full weeks (42 days, so the grid never jumps in height);
// a week is 7 days.
export function calendarDays(view: View, anchor: Date, firstDay: number): Date[] {
  const start =
    view === "month"
      ? startOfWeek(new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)), firstDay)
      : startOfWeek(anchor, firstDay);
  return Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => addDays(start, i));
}

// The anchor of the previous (-1) or next (+1) month / week. A month moves to the 1st, so
// 31 January + 1 month is February, not 3 March.
export function shift(view: View, anchor: Date, step: -1 | 1): Date {
  if (view === "week") return addDays(anchor, 7 * step);
  return new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + step, 1));
}

// What to ask the API for: the days on screen plus a day on each side, because a post's day is
// in its brand's zone - up to 14 hours away from UTC. A month (42 days) stays under the API's 62.
export function fetchRange(days: Date[]): { from: string; to: string } {
  return { from: addDays(days[0], -1).toISOString(), to: addDays(days[days.length - 1], 2).toISOString() };
}

// Today's date in a zone: "2026-11-05".
export function todayIn(timeZone: string, now = new Date()): string {
  return toZonedInput(now.toISOString(), timeZone).slice(0, 10);
}

export type Slot = { post: Post; time: string };

// Each post on its day, in its brand's zone, earliest first. Posts outside the days on screen
// (fetched only for the zone margin) are left out.
export function groupByDay(posts: Post[], days: Date[]): Map<string, Slot[]> {
  const byDay = new Map<string, Slot[]>(days.map((d) => [dayKey(d), []]));
  for (const post of posts) {
    if (!post.scheduledAt) continue;
    const local = toZonedInput(post.scheduledAt, post.brand.timezone); // "2026-11-05T18:30"
    byDay.get(local.slice(0, 10))?.push({ post, time: local.slice(11) });
  }
  for (const slots of byDay.values()) slots.sort((a, b) => a.time.localeCompare(b.time));
  return byDay;
}

const intlLocale = (locale: Locale) => (locale === "ar" ? "ar-PS-u-nu-latn" : "en-GB");

// "تشرين الثاني 2026" / "November 2026"
export function monthTitle(anchor: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", month: "long", year: "numeric" }).format(
    anchor,
  );
}

// "2 – 8 تشرين الثاني 2026" / "2 – 8 November 2026" (or across two months)
export function weekTitle(days: Date[], locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatRange(days[0], days[days.length - 1]);
}

// The week's day names in order: short ["السبت", ...] / ["Mon", ...], or narrow for phones ["س", ...] / ["M", ...]
export function weekdayNames(days: Date[], locale: Locale, width: "short" | "narrow" = "short"): string[] {
  const format = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", weekday: width });
  return days.slice(0, 7).map((d) => format.format(d));
}

// "الخميس 5" / "Thu 5" - a day's heading in the week view.
export function dayTitle(day: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "UTC", weekday: "long", day: "numeric" }).format(day);
}
