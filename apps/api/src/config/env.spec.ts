import { validateEnv } from "./env.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const base = { DATABASE_URL: "postgresql://postflow:postflow@localhost:5432/postflow" };

describe("validateEnv", () => {
  it("fills in the defaults", () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.WEB_ORIGIN).toBe("http://localhost:3000");
  });

  it("picks the Redis key prefix from NODE_ENV, unless one is set", () => {
    expect(validateEnv(base).REDIS_PREFIX).toBe("dev");
    expect(validateEnv({ ...base, NODE_ENV: "test" }).REDIS_PREFIX).toBe("test");
    const prod = { ...base, NODE_ENV: "production", JWT_SECRET: "x".repeat(32), TOKEN_ENCRYPTION_KEY: KEY };
    expect(validateEnv(prod).REDIS_PREFIX).toBe("prod");
    expect(validateEnv({ ...base, REDIS_PREFIX: "" }).REDIS_PREFIX).toBe("dev"); // empty = not set
    expect(validateEnv({ ...base, REDIS_PREFIX: "staging" }).REDIS_PREFIX).toBe("staging");
    expect(() => validateEnv({ ...base, REDIS_PREFIX: "a:b" })).toThrow(/REDIS_PREFIX/);
  });

  it("turns PORT into a number", () => {
    expect(validateEnv({ ...base, PORT: "5001" }).PORT).toBe(5001);
  });

  it("refuses to start without DATABASE_URL", () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it("refuses a database address that is not PostgreSQL", () => {
    expect(() => validateEnv({ DATABASE_URL: "mongodb://localhost/x" })).toThrow(/postgresql:\/\//);
  });

  it("refuses a bad Redis address and a bad PORT, listing both", () => {
    expect(() => validateEnv({ ...base, REDIS_URL: "localhost:6379", PORT: "abc" })).toThrow(
      /REDIS_URL[\s\S]*PORT|PORT[\s\S]*REDIS_URL/,
    );
  });

  it("uses a development login secret when none is set, but requires one in production", () => {
    expect(validateEnv(base).JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(() => validateEnv({ ...base, NODE_ENV: "production" })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...base, JWT_SECRET: "too-short" })).toThrow(/32 characters/);
    expect(validateEnv({ ...base, JWT_SECRET: "" }).JWT_SECRET.length).toBeGreaterThanOrEqual(32); // as in .env.example
    expect(() => validateEnv({ ...base, JWT_SECRET: "", NODE_ENV: "production" })).toThrow(/required in production/);
  });

  it("reads CLOUDINARY_URL into its three parts; empty or missing = uploads off", () => {
    expect(
      validateEnv({ ...base, CLOUDINARY_URL: "cloudinary://123456789012345:AbC-d_Ef@gspwkbou" }).CLOUDINARY_URL,
    ).toEqual({ cloudName: "gspwkbou", apiKey: "123456789012345", apiSecret: "AbC-d_Ef" });
    expect(validateEnv({ ...base, CLOUDINARY_URL: "" }).CLOUDINARY_URL).toBeUndefined();
    expect(validateEnv(base).CLOUDINARY_URL).toBeUndefined();
    expect(() => validateEnv({ ...base, CLOUDINARY_URL: "https://cloudinary.com/x" })).toThrow(/CLOUDINARY_URL/);
  });

  it("Meta: both keys or neither", () => {
    expect(validateEnv(base).META).toBeUndefined();
    expect(validateEnv({ ...base, META_APP_ID: "1234567890", META_APP_SECRET: "0123456789abcdef0123" }).META).toEqual({
      appId: "1234567890",
      appSecret: "0123456789abcdef0123",
      graphVersion: "v24.0",
    });
    expect(() => validateEnv({ ...base, META_APP_ID: "1234567890" })).toThrow(/set both, or neither/);
    // Production may start without Meta (the site goes online before the Meta app exists).
    const prod = { ...base, NODE_ENV: "production", JWT_SECRET: "x".repeat(32), TOKEN_ENCRYPTION_KEY: KEY };
    expect(validateEnv(prod).META).toBeUndefined();
  });

  it("TOKEN_ENCRYPTION_KEY: 32 bytes; a dev key in development, required in production", () => {
    expect(Buffer.from(validateEnv(base).TOKEN_ENCRYPTION_KEY, "base64")).toHaveLength(32);
    expect(validateEnv({ ...base, TOKEN_ENCRYPTION_KEY: KEY }).TOKEN_ENCRYPTION_KEY).toBe(KEY);
    expect(() => validateEnv({ ...base, TOKEN_ENCRYPTION_KEY: "short" })).toThrow(/32 bytes/);
    expect(() => validateEnv({ ...base, NODE_ENV: "production", JWT_SECRET: "x".repeat(32) })).toThrow(
      /TOKEN_ENCRYPTION_KEY: required in production/,
    );
  });

  it("RUN_WORKER: off unless it's exactly true", () => {
    expect(validateEnv(base).RUN_WORKER).toBe(false);
    expect(validateEnv({ ...base, RUN_WORKER: "true" }).RUN_WORKER).toBe(true);
    expect(() => validateEnv({ ...base, RUN_WORKER: "yes" })).toThrow(/RUN_WORKER/);
  });

  it("reads TRUST_PROXY as a hop count when it is a number", () => {
    expect(validateEnv(base).TRUST_PROXY).toBe("loopback");
    expect(validateEnv({ ...base, TRUST_PROXY: "2" }).TRUST_PROXY).toBe(2);
  });
});
