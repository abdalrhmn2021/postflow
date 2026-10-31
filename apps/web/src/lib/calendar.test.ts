import { describe, expect, it } from "vitest";
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
} from "./calendar";
import type { Post } from "./types";

const day = (s: string) => parseDay(s)!;
const keys = (days: Date[]) => days.map(dayKey);

function post(id: string, scheduledAt: string, timezone = "Asia/Hebron"): Post {
  return {
    id,
    caption: "",
    platforms: ["FACEBOOK"],
    status: "SCHEDULED",
    scheduledAt,
    publishedAt: null,
    createdAt: scheduledAt,
    updatedAt: scheduledAt,
    brand: { id: "b", name: "B", timezone },
    createdBy: null,
  };
}

describe("calendar", () => {
  it("reads only real dates", () => {
    expect(dayKey(day("2026-11-05"))).toBe("2026-11-05");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2026-11-5")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });

  it("starts the week on Saturday in Arabic and Monday in English", () => {
    const thu = day("2026-11-05");
    expect(keys(calendarDays("week", thu, weekStartsOn("ar")))).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
    expect(dayKey(calendarDays("week", thu, weekStartsOn("en"))[0])).toBe("2026-11-02");
  });

  it("shows a month as 6 full weeks that start before the 1st", () => {
    const days = calendarDays("month", day("2026-11-17"), weekStartsOn("ar"));
    expect(days).toHaveLength(42);
    expect(dayKey(days[0])).toBe("2026-10-31"); // Saturday before Sunday 1 Nov
    expect(keys(days)).toContain("2026-11-30");
  });

  it("moves a month from its 1st (31 Jan -> February) and a week by 7 days", () => {
    expect(dayKey(shift("month", day("2026-01-31"), 1))).toBe("2026-02-01");
    expect(dayKey(shift("month", day("2026-01-15"), -1))).toBe("2025-12-01");
    expect(dayKey(shift("week", day("2026-11-05"), 1))).toBe("2026-11-12");
  });

  it("asks the API for a day more on each side, within its 62-day limit", () => {
    const days = calendarDays("month", day("2026-11-17"), 6);
    const { from, to } = fetchRange(days);
    expect(from).toBe("2026-10-30T00:00:00.000Z");
    expect(to).toBe("2026-12-13T00:00:00.000Z");
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeLessThanOrEqual(62);
  });

  it("puts each post on its day in its brand's zone, earliest first", () => {
    const days = calendarDays("week", day("2026-11-05"), 6);
    const byDay = groupByDay(
      [
        post("late", "2026-11-05T20:00:00Z"), // 22:00 in Hebron, still the 5th
        post("london", "2026-11-05T23:30:00Z", "Europe/London"), // 23:30 in London, the 5th
        post("gaza-next", "2026-11-05T23:30:00Z"), // 01:30 on the 6th in Hebron
        post("early", "2026-11-05T06:00:00Z"), // 08:00
        post("outside", "2026-11-20T10:00:00Z"),
      ],
      days,
    );
    expect(byDay.get("2026-11-05")!.map((s) => [s.post.id, s.time])).toEqual([
      ["early", "08:00"],
      ["late", "22:00"],
      ["london", "23:30"],
    ]);
    expect(byDay.get("2026-11-06")!.map((s) => s.post.id)).toEqual(["gaza-next"]);
    expect([...byDay.values()].flat()).toHaveLength(4);
  });

  it("knows today in a zone, not on the machine", () => {
    const now = new Date("2026-11-05T22:30:00Z");
    expect(todayIn("Asia/Hebron", now)).toBe("2026-11-06");
    expect(todayIn("Europe/London", now)).toBe("2026-11-05");
  });

  it("titles a month and a week", () => {
    expect(monthTitle(day("2026-11-17"), "en")).toBe("November 2026");
    expect(weekTitle(calendarDays("week", day("2026-11-05"), 1), "en")).toMatch(/^2.+8 November 2026$/);
  });
});
