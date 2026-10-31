import { Platform } from "../generated/prisma/client.js";
import { countHashtags, problemsBeforeScheduling } from "./posts.rules.js";

const NOW = new Date("2026-11-01T10:00:00Z");
const LATER = new Date("2026-11-01T18:00:00Z");
const ready = { caption: "عرض اليوم 🍔", platforms: [Platform.FACEBOOK], scheduledAt: LATER };

describe("problemsBeforeScheduling", () => {
  it("says nothing about a complete post", () => {
    expect(problemsBeforeScheduling(ready, NOW)).toEqual({});
  });

  it("names every missing piece of an empty draft", () => {
    expect(problemsBeforeScheduling({ caption: "  \n ", platforms: [], scheduledAt: null }, NOW)).toEqual({
      caption: "Write the post first",
      platforms: "Pick at least one platform",
      scheduledAt: "Pick a time",
    });
  });

  it("refuses a time that has already passed, or is right now", () => {
    expect(problemsBeforeScheduling({ ...ready, scheduledAt: NOW }, NOW)).toEqual({
      scheduledAt: "The time has already passed",
    });
  });

  it("holds Instagram to its caption length, Facebook not", () => {
    const long = { ...ready, caption: "ا".repeat(2201) };
    expect(problemsBeforeScheduling(long, NOW)).toEqual({});
    expect(problemsBeforeScheduling({ ...long, platforms: [Platform.INSTAGRAM] }, NOW).caption).toMatch(/2200/);
  });

  it("holds Instagram to 30 hashtags", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#وسم${i}`).join(" ");
    const insta = { ...ready, platforms: [Platform.FACEBOOK, Platform.INSTAGRAM] };
    expect(problemsBeforeScheduling({ ...insta, caption: tags(30) }, NOW)).toEqual({});
    expect(problemsBeforeScheduling({ ...insta, caption: tags(31) }, NOW).caption).toMatch(/30 hashtags/);
  });
});

describe("countHashtags", () => {
  it("counts Arabic, English and numbered tags, not a lone #", () => {
    expect(countHashtags("#برجر #gaza_food #2026 # and C#")).toBe(3);
    expect(countHashtags("no tags")).toBe(0);
  });
});
