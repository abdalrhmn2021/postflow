import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";

// Encrypts the Facebook page tokens before they go into the database, and back.
// A page token lets anyone post on that page, so a leaked database (a backup, a stolen dump)
// must not leak the pages too: without TOKEN_ENCRYPTION_KEY the stored text is useless.
//
// AES-256-GCM: a new random IV (12 bytes) per token, and an auth tag that makes decryption fail
// loudly if anyone changed the stored text. Stored as  v1.<iv>.<tag>.<ciphertext>  (base64url).
// The "v1" leaves room to change the method later without losing the tokens stored before.
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decrypt(stored: string, key: Buffer): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) throw new Error("Not an encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

// Encrypts with TOKEN_ENCRYPTION_KEY. Decrypts with it, or - while the key is being changed - with
// TOKEN_ENCRYPTION_KEY_PREVIOUS, so the tokens stored before the change keep working.
@Injectable()
export class TokenCipher {
  private readonly key: Buffer;
  private readonly previousKey: Buffer | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.key = Buffer.from(config.get("TOKEN_ENCRYPTION_KEY", { infer: true }), "base64");
    const previous = config.get("TOKEN_ENCRYPTION_KEY_PREVIOUS", { infer: true });
    this.previousKey = previous ? Buffer.from(previous, "base64") : undefined;
  }

  // True while the key is being changed: the worker then re-encrypts the old tokens.
  get rotating() {
    return this.previousKey !== undefined;
  }

  encrypt(plain: string) {
    return encrypt(plain, this.key);
  }

  decrypt(stored: string) {
    return this.open(stored).plain;
  }

  // Like decrypt, and also says whether it took the previous key (old = encrypt it again).
  // Throws when neither key opens it.
  open(stored: string): { plain: string; old: boolean } {
    try {
      return { plain: decrypt(stored, this.key), old: false };
    } catch (err) {
      if (!this.previousKey) throw err;
      return { plain: decrypt(stored, this.previousKey), old: true };
    }
  }
}
