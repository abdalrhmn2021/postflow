import { createBrandSchema, isTimeZone, setEditorsSchema, updateBrandSchema } from "./brands.schemas.js";

describe("brand schemas", () => {
  it("fills in Arabic and Gaza's time zone by default", () => {
    expect(createBrandSchema.parse({ name: " برجر هم " })).toEqual({
      name: "برجر هم",
      language: "ar",
      timezone: "Asia/Hebron",
    });
  });

  it("knows real time zones from typos", () => {
    expect(isTimeZone("Europe/London")).toBe(true);
    expect(isTimeZone("Asia/Gaza")).toBe(true);
    expect(isTimeZone("Asia/Hebronn")).toBe(false);
    expect(createBrandSchema.safeParse({ name: "x", timezone: "Mars/Base" }).success).toBe(false);
  });

  it("turns an empty voice into no voice", () => {
    expect(updateBrandSchema.parse({ voice: "   " })).toEqual({ voice: null });
  });

  it("refuses an update that changes nothing, and an unknown language", () => {
    expect(updateBrandSchema.safeParse({}).success).toBe(false);
    expect(updateBrandSchema.safeParse({ language: "fr" }).success).toBe(false);
  });

  it("drops repeated editor ids", () => {
    expect(setEditorsSchema.parse({ userIds: ["a", "b", "a"] }).userIds).toEqual(["a", "b"]);
  });
});
