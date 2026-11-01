import { describe, expect, it } from "vitest";
import { checkFile, formatDuration, mediaProblem, previewUrl, thumbUrl } from "./media";

const MB = 1024 * 1024;
const image = (width: number, height: number) => ({ type: "IMAGE" as const, width, height, duration: null });
const video = (duration: number) => ({ type: "VIDEO" as const, width: 1080, height: 1920, duration });
const SQUARE = image(1080, 1080);

describe("checkFile", () => {
  it("knows photos and videos by type, or by extension when the phone sends no type", () => {
    expect(checkFile({ name: "a.JPG", type: "image/jpeg", size: MB })).toEqual({ kind: "IMAGE" });
    expect(checkFile({ name: "clip.mov", type: "", size: 50 * MB })).toEqual({ kind: "VIDEO" });
    expect(checkFile({ name: "photo", type: "image/png", size: MB })).toEqual({ kind: "IMAGE" });
  });

  it("refuses other formats and files past the limit", () => {
    expect(checkFile({ name: "a.gif", type: "image/gif", size: MB })).toEqual({ problem: "fileFormat", n: 0 });
    expect(checkFile({ name: "a.heic", type: "image/heic", size: MB })).toEqual({ problem: "fileFormat", n: 0 });
    expect(checkFile({ name: "a.png", type: "image/png", size: 11 * MB })).toEqual({ problem: "fileSize", n: 10 });
    expect(checkFile({ name: "a.mp4", type: "video/mp4", size: 101 * MB })).toEqual({ problem: "fileSize", n: 100 });
  });
});

describe("mediaProblem - the API's rules", () => {
  it("Instagram needs a file; Facebook can go with text only", () => {
    expect(mediaProblem(["INSTAGRAM"], [])).toEqual({ key: "needsMedia", n: 0 });
    expect(mediaProblem(["FACEBOOK"], [])).toBeNull();
  });

  it("names the file that breaks Instagram's rules", () => {
    expect(mediaProblem(["INSTAGRAM"], [SQUARE, image(1080, 1920)])).toEqual({ key: "mediaRatio", n: 2 });
    expect(mediaProblem(["INSTAGRAM"], [image(1080, 1350), image(1080, 566)])).toBeNull();
    expect(mediaProblem(["INSTAGRAM"], [video(2)])).toEqual({ key: "reelLength", n: 1 });
    expect(mediaProblem(["INSTAGRAM"], [SQUARE, video(90)])).toEqual({ key: "carouselVideo", n: 2 });
  });

  it("Facebook: photos, or one video alone", () => {
    expect(mediaProblem(["FACEBOOK"], [SQUARE, video(10)])).toEqual({ key: "facebookVideo", n: 0 });
    expect(mediaProblem(["FACEBOOK"], [video(600)])).toBeNull();
  });
});

describe("Cloudinary URLs", () => {
  const url = "https://res.cloudinary.com/demo/image/upload/v17/postflow/a/b/c.png";
  const vid = "https://res.cloudinary.com/demo/video/upload/v17/postflow/a/b/c.mov";

  it("asks Cloudinary for a small tile, and a video's first frame as a JPEG", () => {
    expect(thumbUrl({ type: "IMAGE", url })).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_fill,w_240,h_240,q_auto,f_auto/v17/postflow/a/b/c.png",
    );
    expect(thumbUrl({ type: "VIDEO", url: vid }, 96)).toBe(
      "https://res.cloudinary.com/demo/video/upload/c_fill,w_96,h_96,q_auto,so_0/v17/postflow/a/b/c.jpg",
    );
  });

  it("plays a .mov as MP4, and leaves a non-Cloudinary URL alone", () => {
    expect(previewUrl({ type: "VIDEO", url: vid })).toMatch(/\/upload\/q_auto\/v17\/postflow\/a\/b\/c\.mp4$/);
    expect(previewUrl({ type: "IMAGE", url: "https://example.test/x.jpg" })).toBe("https://example.test/x.jpg");
  });

  it("writes a length as m:ss", () => {
    expect(formatDuration(75.4)).toBe("1:15");
    expect(formatDuration(5)).toBe("0:05");
  });
});
