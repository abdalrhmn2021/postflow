import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "./token-cipher.js";

const KEY = randomBytes(32);
const TOKEN = "EAAGm0PX4ZCpsBAJ-page-token";

describe("token cipher", () => {
  it("gets the same token back, and never stores it readable", () => {
    const stored = encrypt(TOKEN, KEY);
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain("EAAG");
    expect(decrypt(stored, KEY)).toBe(TOKEN);
  });

  it("encrypts the same token differently each time (a new IV)", () => {
    expect(encrypt(TOKEN, KEY)).not.toBe(encrypt(TOKEN, KEY));
  });

  it("refuses the wrong key and a changed text", () => {
    const stored = encrypt(TOKEN, KEY);
    expect(() => decrypt(stored, randomBytes(32))).toThrow();
    const [v, iv, tag, data] = stored.split(".");
    const flipped = (data[0] === "A" ? "B" : "A") + data.slice(1);
    expect(() => decrypt([v, iv, tag, flipped].join("."), KEY)).toThrow();
    expect(() => decrypt("plain-token", KEY)).toThrow(/Not an encrypted token/);
  });
});
