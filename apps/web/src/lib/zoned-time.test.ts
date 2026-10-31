import { describe, expect, it } from "vitest";
import { formatInZone, fromZonedInput, toZonedInput } from "./zoned-time";

describe("zoned time", () => {
  // [wall clock in the zone, zone, the UTC moment]
  const cases: [string, string, string][] = [
    ["2026-11-05T18:30", "Asia/Hebron", "2026-11-05T16:30:00.000Z"], // winter, +2
    ["2026-07-05T18:30", "Asia/Hebron", "2026-07-05T15:30:00.000Z"], // summer, +3
    ["2026-11-05T18:30", "Europe/London", "2026-11-05T18:30:00.000Z"],
    ["2026-07-05T18:30", "Europe/London", "2026-07-05T17:30:00.000Z"],
    ["2026-11-05T09:00", "America/New_York", "2026-11-05T14:00:00.000Z"],
    ["2026-03-29T00:30", "Europe/London", "2026-03-29T00:30:00.000Z"], // just before the clocks go forward
    ["2026-03-29T02:30", "Europe/London", "2026-03-29T01:30:00.000Z"], // just after
    ["2026-11-05T18:30", "Asia/Kolkata", "2026-11-05T13:00:00.000Z"], // a half-hour zone
  ];

  it.each(cases)("%s in %s is %s, and back", (wall, zone, utc) => {
    expect(fromZonedInput(wall, zone)).toBe(utc);
    expect(toZonedInput(utc, zone)).toBe(wall);
  });

  it("gives null for an empty or broken value", () => {
    expect(fromZonedInput("", "UTC")).toBeNull();
    expect(fromZonedInput("2026-11-05", "UTC")).toBeNull();
  });

  it("formats in the zone, with Latin digits in Arabic", () => {
    expect(formatInZone("2026-11-05T16:30:00.000Z", "Asia/Hebron", "en")).toBe("Thu 5 Nov, 18:30");
    expect(formatInZone("2026-11-05T16:30:00.000Z", "Asia/Hebron", "ar")).toMatch(/5 .* 18:30$/);
  });
});
