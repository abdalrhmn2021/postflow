import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", stored)).toBe(true);
    expect(await verifyPassword("correct hors", stored)).toBe(false);
  });

  it("never stores the password itself, and salts each hash", async () => {
    const a = await hashPassword("12345678");
    const b = await hashPassword("12345678");
    expect(a).not.toContain("12345678");
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toBe(b);
  });

  it("returns false for a malformed stored value instead of throwing", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "bcrypt$abc")).toBe(false);
  });
});
