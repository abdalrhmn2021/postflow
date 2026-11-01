import { MediaType, Platform } from "../generated/prisma/client.js";
import { countHashtags, problemsBeforeScheduling } from "./posts.rules.js";

const NOW = new Date("2026-11-01T10:00:00Z");
const LATER = new Date("2026-11-01T18:00:00Z");
const ready = { caption: "عرض اليوم 🍔", platforms: [Platform.FACEBOOK], scheduledAt: LATER, media: [] };
const image = (width: number, height: number) => ({ type: MediaType.IMAGE, width, height, duration: null });
const video = (duration: number | null) => ({ type: MediaType.VIDEO, width: 1080, height: 1920, duration });
const SQUARE = image(1080, 1080);

describe("problemsBeforeScheduling", () => {
  it("says nothing about a complete post", () => {
    expect(problemsBeforeScheduling(ready, NOW)).toEqual({});
  });

  it("names every missing piece of an empty draft", () => {
    expect(problemsBeforeScheduling({ caption: "  \n ", platforms: [], scheduledAt: null, media: [] }, NOW)).toEqual({
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
    expect(
      problemsBeforeScheduling({ ...long, platforms: [Platform.INSTAGRAM], media: [SQUARE] }, NOW).caption,
    ).toMatch(/2200/);
  });

  it("holds Instagram to 30 hashtags", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#وسم${i}`).join(" ");
    const insta = { ...ready, platforms: [Platform.FACEBOOK, Platform.INSTAGRAM], media: [SQUARE] };
    expect(problemsBeforeScheduling({ ...insta, caption: tags(30) }, NOW)).toEqual({});
    expect(problemsBeforeScheduling({ ...insta, caption: tags(31) }, NOW).caption).toMatch(/30 hashtags/);
  });
});

describe("problemsBeforeScheduling - connected accounts", () => {
  const both = { ...ready, platforms: [Platform.FACEBOOK, Platform.INSTAGRAM], media: [SQUARE] };

  it("not checked when Meta isn't set up (connected undefined)", () => {
    expect(problemsBeforeScheduling(both, NOW)).toEqual({});
  });

  it("each platform needs its account connected", () => {
    const check = (facebook: boolean, instagram: boolean) =>
      problemsBeforeScheduling({ ...both, connected: { facebook, instagram } }, NOW).platforms;
    expect(check(true, true)).toBeUndefined();
    expect(check(false, false)).toBe("The client's Facebook page isn't connected");
    expect(check(true, false)).toBe("The client's Instagram account isn't connected");
    expect(
      problemsBeforeScheduling({ ...ready, connected: { facebook: true, instagram: false } }, NOW).platforms,
    ).toBeUndefined(); // Facebook only: Instagram doesn't matter
  });
});

describe("problemsBeforeScheduling - files", () => {
  const insta = (...media: ReturnType<typeof image | typeof video>[]) =>
    problemsBeforeScheduling({ ...ready, platforms: [Platform.INSTAGRAM], media }, NOW).media;
  const facebook = (...media: ReturnType<typeof image | typeof video>[]) =>
    problemsBeforeScheduling({ ...ready, platforms: [Platform.FACEBOOK], media }, NOW).media;

  it("Facebook may go out with text only; Instagram needs an image or a video", () => {
    expect(facebook()).toBeUndefined();
    expect(insta()).toBe("Instagram needs an image or a video");
  });

  it("Instagram takes images from 4:5 to 1.91:1, and names the file that isn't", () => {
    expect(insta(image(1080, 1350), image(1080, 566), SQUARE)).toBeUndefined(); // 4:5, 1.91:1, square
    expect(insta(image(1079, 1350))).toBeUndefined(); // a pixel off is fine
    expect(insta(SQUARE, image(1080, 1920))).toBe("File 2: Instagram takes images from 4:5 to 1.91:1"); // a 9:16 story
    expect(insta(image(3000, 1000))).toMatch(/^File 1:/); // a 3:1 panorama
  });

  it("an Instagram video alone is a Reel (3 s to 15 min); in a carousel at most 60 s", () => {
    expect(insta(video(30))).toBeUndefined();
    expect(insta(video(2))).toBe("File 1: Instagram takes videos of 3 s to 15 min");
    expect(insta(video(16 * 60))).toMatch(/15 min/);
    expect(insta(SQUARE, video(45))).toBeUndefined();
    expect(insta(SQUARE, video(90))).toBe("File 2: a video in a carousel is at most 60 s");
    expect(insta(video(null))).toBeUndefined(); // length unknown: Meta decides at publish time
  });

  it("Facebook takes photos, or one video on its own", () => {
    expect(facebook(SQUARE, SQUARE, SQUARE)).toBeUndefined();
    expect(facebook(video(600))).toBeUndefined();
    expect(facebook(SQUARE, video(10))).toBe("Facebook takes a video on its own");
  });
});

describe("countHashtags", () => {
  it("counts Arabic, English and numbered tags, not a lone #", () => {
    expect(countHashtags("#برجر #gaza_food #2026 # and C#")).toBe(3);
    expect(countHashtags("no tags")).toBe(0);
  });
});
