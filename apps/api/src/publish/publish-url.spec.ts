import { publishUrl } from "./publish-url.js";

const base = "https://res.cloudinary.com/demo";

describe("publishUrl", () => {
  it("sends images to Meta as JPEG", () => {
    expect(publishUrl({ type: "IMAGE", url: `${base}/image/upload/v1/postflow/a/b/c.png`, format: "png" }).url).toBe(
      `${base}/image/upload/f_jpg,q_auto:good/v1/postflow/a/b/c.jpg`,
    );
  });

  it("sends an MP4 as it is, and converts a MOV to MP4", () => {
    const mp4 = `${base}/video/upload/v1/postflow/a/b/c.mp4`;
    expect(publishUrl({ type: "VIDEO", url: mp4, format: "mp4" }).url).toBe(mp4);
    expect(publishUrl({ type: "VIDEO", url: `${base}/video/upload/v1/x.mov`, format: "mov" }).url).toBe(
      `${base}/video/upload/f_mp4/v1/x.mp4`,
    );
  });

  it("leaves other URLs alone", () => {
    expect(publishUrl({ type: "IMAGE", url: "https://fake.test/x.png", format: "png" }).url).toBe(
      "https://fake.test/x.png",
    );
  });
});
