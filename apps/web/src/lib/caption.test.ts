import { describe, expect, it } from "vitest";
import { countHashtags, scheduleProblems, splitHashtags } from "./caption";

const NOW = new Date("2026-11-01T10:00:00Z");
const LATER = "2026-11-01T18:00:00.000Z";

describe("caption", () => {
  it("counts Arabic, English and numbered hashtags, not a lone #", () => {
    expect(countHashtags("#برجر #gaza_food #2026 # and C#")).toBe(3);
  });

  it("cuts the caption into text and tags, losing nothing", () => {
    const parts = splitHashtags("عرض اليوم #برجر و #كولا!");
    expect(parts.filter((p) => p.tag).map((p) => p.text)).toEqual(["#برجر", "#كولا"]);
    expect(parts.map((p) => p.text).join("")).toBe("عرض اليوم #برجر و #كولا!");
  });

  it("finds the same problems as the API before scheduling", () => {
    expect(scheduleProblems({ caption: " ", platforms: [], scheduledAt: null }, NOW)).toEqual({
      caption: "writeFirst",
      platforms: "pickPlatform",
      scheduledAt: "pickTime",
    });
    expect(scheduleProblems({ caption: "x", platforms: ["FACEBOOK"], scheduledAt: NOW.toISOString() }, NOW)).toEqual({
      scheduledAt: "timePassed",
    });
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(scheduleProblems({ caption: tags, platforms: ["FACEBOOK"], scheduledAt: LATER }, NOW)).toEqual({});
    expect(scheduleProblems({ caption: tags, platforms: ["INSTAGRAM"], scheduledAt: LATER }, NOW)).toEqual({
      caption: "instagramHashtags",
    });
    expect(
      scheduleProblems({ caption: "ا".repeat(2201), platforms: ["INSTAGRAM"], scheduledAt: LATER }, NOW).caption,
    ).toBe("instagramChars");
  });
});
