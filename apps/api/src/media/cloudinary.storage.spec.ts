import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { MediaType } from "../generated/prisma/client.js";
import { CloudinaryStorage, signParams } from "./cloudinary.storage.js";
import { fileProblem } from "./media.rules.js";

const storage = (url?: { cloudName: string; apiKey: string; apiSecret: string }) =>
  new CloudinaryStorage({ get: () => url } as unknown as ConfigService<Env, true>);

describe("signParams", () => {
  it("matches the example in Cloudinary's documentation", () => {
    const params = { timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" };
    expect(signParams(params, "abcd")).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("doesn't depend on the order the parameters were written in", () => {
    expect(signParams({ b: 2, a: 1 }, "s")).toBe(signParams({ a: 1, b: 2 }, "s"));
  });
});

describe("CloudinaryStorage", () => {
  it("signs an upload for exactly one name, with the allowed formats", () => {
    const ticket = storage({ cloudName: "demo", apiKey: "111", apiSecret: "secret" }).uploadTicket("postflow/a/b/c");
    expect(ticket.url).toBe("https://api.cloudinary.com/v1_1/demo/auto/upload");
    const { api_key, signature, ...signed } = ticket.fields;
    expect(api_key).toBe("111");
    expect(signed).toMatchObject({ public_id: "postflow/a/b/c", allowed_formats: "jpg,jpeg,png,webp,mp4,mov" });
    expect(signature).toBe(signParams(signed, "secret")); // the secret itself is never sent
    expect(JSON.stringify(ticket)).not.toContain("secret");
  });

  it("without CLOUDINARY_URL: uploads are off (503), deleting is a no-op", async () => {
    const off = storage();
    expect(off.configured).toBe(false);
    expect(() => off.uploadTicket("x")).toThrow(/aren't set up/);
    await expect(off.remove([{ publicId: "x", type: MediaType.IMAGE }])).resolves.toBeUndefined();
  });
});

describe("fileProblem", () => {
  it("accepts the usual photo and video files", () => {
    expect(fileProblem({ type: MediaType.IMAGE, format: "jpg", bytes: 2_000_000 })).toBeNull();
    expect(fileProblem({ type: MediaType.VIDEO, format: "MOV", bytes: 80_000_000 })).toBeNull();
  });

  it("refuses other formats and files past the size limit", () => {
    expect(fileProblem({ type: MediaType.IMAGE, format: "gif", bytes: 1 })).toBe("Must be jpg, jpeg, png, webp");
    expect(fileProblem({ type: MediaType.IMAGE, format: "png", bytes: 11 * 1024 * 1024 })).toBe("At most 10 MB");
    expect(fileProblem({ type: MediaType.VIDEO, format: "mp4", bytes: 101 * 1024 * 1024 })).toBe("At most 100 MB");
  });
});
