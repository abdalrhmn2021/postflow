// Times in a brand's time zone, whatever zone the visitor's computer is in.
// The API stores UTC; a post for a London client at "18:30" means 18:30 in London, even when the
// editor works from Gaza. No library: the browser's and Node's Intl know every IANA zone.
// Safe anywhere (server and client).

// The wall clock in `timeZone` at the moment `date`.
function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

// How far `timeZone` is ahead of UTC at the moment `date`, in milliseconds (+2 h in Gaza in winter).
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

// UTC ISO -> the value of an <input type="datetime-local"> in that zone: "2026-11-05T18:30".
export function toZonedInput(iso: string, timeZone: string): string {
  const p = partsIn(new Date(iso), timeZone);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

// "2026-11-05T18:30" read as a wall clock in `timeZone` -> the UTC ISO the API wants.
// null for an empty or broken value. The offset is checked twice, so a time next to a daylight-saving
// change lands on the right side of it.
export function fromZonedInput(value: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - offsetMs(new Date(wall), timeZone);
  utc = wall - offsetMs(new Date(utc), timeZone);
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// "الخميس 5 نوفمبر، 18:30" / "Thu 5 Nov, 18:30" in that zone. Latin digits, like the rest of the site.
export function formatInZone(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-PS-u-nu-latn" : "en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
