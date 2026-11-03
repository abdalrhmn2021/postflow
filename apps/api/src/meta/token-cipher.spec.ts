import { randomBytes } from "node:crypto";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { decrypt, encrypt, TokenCipher } from "./token-cipher.js";

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

  describe("changing the key (TOKEN_ENCRYPTION_KEY_PREVIOUS)", () => {
    const OLD = randomBytes(32);
    const NEW = randomBytes(32);
    const cipher = (key: Buffer, previous?: Buffer) =>
      new TokenCipher({
        get: (name: string) =>
          name === "TOKEN_ENCRYPTION_KEY" ? key.toString("base64") : previous?.toString("base64"),
      } as unknown as ConfigService<Env, true>);

    it("opens tokens from before the change, and says they're old", () => {
      const stored = encrypt(TOKEN, OLD);
      const c = cipher(NEW, OLD);
      expect(c.rotating).toBe(true);
      expect(c.decrypt(stored)).toBe(TOKEN);
      expect(c.open(stored)).toEqual({ plain: TOKEN, old: true });
    });

    it("encrypts with the new key only", () => {
      const c = cipher(NEW, OLD);
      const stored = c.encrypt(TOKEN);
      expect(c.open(stored)).toEqual({ plain: TOKEN, old: false });
      expect(decrypt(stored, NEW)).toBe(TOKEN);
      expect(() => decrypt(stored, OLD)).toThrow();
    });

    it("without a previous key, an old token is refused as before", () => {
      const c = cipher(NEW);
      expect(c.rotating).toBe(false);
      expect(() => c.decrypt(encrypt(TOKEN, OLD))).toThrow();
    });

    it("a token neither key opens is refused", () => {
      expect(() => cipher(NEW, OLD).open(encrypt(TOKEN, randomBytes(32)))).toThrow();
    });
  });
});
