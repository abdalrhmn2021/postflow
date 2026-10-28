import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Passwords are hashed with scrypt, built into Node: no native package to install or compile.
// scrypt is slow and memory-hungry on purpose, so guessing a stolen hash costs an attacker a lot.
//
// Stored format:  scrypt$N$r$p$<salt base64>$<hash base64>
// The cost settings are saved with each hash, so they can be raised later without breaking old passwords.
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024; // N=2^15, r=8 needs 32 MB, Node's default limit is exactly 32 MB

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFC"), salt, KEY_LENGTH, { ...opts, maxmem: MAX_MEMORY }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES); // a new salt per password: two users with "12345678" get different hashes
  const key = await derive(password, salt, PARAMS);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), key.toString("base64")].join("$");
}

// false for a wrong password and for a malformed stored value - never throws on bad input.
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;

  const expected = Buffer.from(keyB64, "base64");
  const actual = await derive(password, Buffer.from(saltB64, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  // Constant-time compare: how long it takes doesn't reveal how many bytes matched.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
