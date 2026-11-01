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
    const none = { media: [] };
    expect(scheduleProblems({ caption: " ", platforms: [], scheduledAt: null, ...none }, NOW)).toEqual({
      caption: { key: "writeFirst", n: 0 },
      platforms: { key: "pickPlatform", n: 0 },
      scheduledAt: { key: "pickTime", n: 0 },
    });
    expect(
      scheduleProblems({ caption: "x", platforms: ["FACEBOOK"], scheduledAt: NOW.toISOString(), ...none }, NOW),
    ).toEqual({ scheduledAt: { key: "timePassed", n: 0 } });

    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    const square = { media: [{ type: "IMAGE" as const, width: 1080, height: 1080, duration: null }] };
    expect(scheduleProblems({ caption: tags, platforms: ["FACEBOOK"], scheduledAt: LATER, ...none }, NOW)).toEqual({});
    expect(scheduleProblems({ caption: tags, platforms: ["INSTAGRAM"], scheduledAt: LATER, ...square }, NOW)).toEqual({
      caption: { key: "instagramHashtags", n: 30 },
    });
    expect(
      scheduleProblems({ caption: "ا".repeat(2201), platforms: ["INSTAGRAM"], scheduledAt: LATER, ...square }, NOW)
        .caption,
    ).toEqual({ key: "instagramChars", n: 2200 });
  });

  it("a platform whose account isn't connected: the problem is under platforms", () => {
    const post = { caption: "x", platforms: ["FACEBOOK" as const], scheduledAt: LATER, media: [] };
    expect(scheduleProblems({ ...post, connected: null }, NOW)).toEqual({}); // Meta not set up: not checked
    expect(scheduleProblems({ ...post, connected: { facebook: false, instagram: false } }, NOW)).toEqual({
      platforms: { key: "facebookNotConnected", n: 0 },
    });
  });

  it("a client that approves posts: only an approved one can be scheduled", () => {
    const post = { caption: "x", platforms: ["FACEBOOK" as const], scheduledAt: LATER, media: [] };
    expect(scheduleProblems({ ...post, approval: { required: true, state: "PENDING" } }, NOW)).toEqual({
      approval: { key: "notApproved", n: 0 },
    });
    expect(scheduleProblems({ ...post, approval: { required: true, state: "APPROVED" } }, NOW)).toEqual({});
    expect(scheduleProblems({ ...post, approval: { required: false, state: "NONE" } }, NOW)).toEqual({});
  });

  it("Instagram with no file: the problem is under media", () => {
    expect(scheduleProblems({ caption: "x", platforms: ["INSTAGRAM"], scheduledAt: LATER, media: [] }, NOW)).toEqual({
      media: { key: "needsMedia", n: 0 },
    });
  });
});
