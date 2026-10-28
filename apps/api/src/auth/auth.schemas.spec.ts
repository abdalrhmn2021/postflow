import { registerSchema } from "./auth.schemas.js";

const valid = {
  agencyName: "سنتريفا",
  slug: "centriva",
  name: "عبد الرحمن",
  email: "owner@centriva.ps",
  password: "a-long-password",
};

describe("registerSchema", () => {
  it("accepts a valid sign-up and cleans it up", () => {
    const out = registerSchema.parse({ ...valid, email: "  Owner@Centriva.PS ", slug: " Centriva " });
    expect(out.email).toBe("owner@centriva.ps");
    expect(out.slug).toBe("centriva");
  });

  it.each([
    ["a slug with spaces", { slug: "my agency" }, "slug"],
    ["an Arabic slug", { slug: "سنتريفا" }, "slug"],
    ["a slug ending in a dash", { slug: "centriva-" }, "slug"],
    ["a bad email", { email: "not-an-email" }, "email"],
    ["a short password", { password: "1234567" }, "password"],
    ["an empty agency name", { agencyName: "  " }, "agencyName"],
  ])("rejects %s", (_label, change, field) => {
    const result = registerSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});
