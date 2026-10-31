import { createPostSchema, listPostsSchema, updatePostSchema } from "./posts.schemas.js";

describe("post schemas", () => {
  it("a new post needs only its brand; the rest starts empty", () => {
    expect(createPostSchema.parse({ brandId: "b1" })).toEqual({
      brandId: "b1",
      caption: "",
      platforms: [],
      scheduledAt: null,
    });
  });

  it("keeps the caption as written (no trimming) and drops a repeated platform", () => {
    const post = createPostSchema.parse({
      brandId: "b1",
      caption: "  سطر\n\nسطر  ",
      platforms: ["FACEBOOK", "FACEBOOK"],
    });
    expect(post.caption).toBe("  سطر\n\nسطر  ");
    expect(post.platforms).toEqual(["FACEBOOK"]);
  });

  it("reads a local time with its offset as the right UTC moment", () => {
    const post = createPostSchema.parse({ brandId: "b1", scheduledAt: "2026-11-05T18:30:00+02:00" });
    expect(post.scheduledAt?.toISOString()).toBe("2026-11-05T16:30:00.000Z");
  });

  it("refuses a time with no offset (whose 18:30?), an unknown platform, and an empty change", () => {
    expect(createPostSchema.safeParse({ brandId: "b1", scheduledAt: "2026-11-05T18:30:00" }).success).toBe(false);
    expect(createPostSchema.safeParse({ brandId: "b1", platforms: ["TIKTOK"] }).success).toBe(false);
    expect(updatePostSchema.safeParse({}).success).toBe(false);
    expect(updatePostSchema.parse({ scheduledAt: null })).toEqual({ scheduledAt: null });
  });

  it("the calendar range must go forward and be at most 62 days", () => {
    const from = "2026-11-01T00:00:00+02:00";
    expect(listPostsSchema.safeParse({ from, to: "2026-12-01T00:00:00+02:00" }).success).toBe(true);
    expect(listPostsSchema.safeParse({ from, to: from }).success).toBe(false);
    expect(listPostsSchema.safeParse({ from, to: "2027-02-01T00:00:00+02:00" }).success).toBe(false);
  });
});
