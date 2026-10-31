import { validateEnv } from "./env.js";

const base = { DATABASE_URL: "postgresql://postflow:postflow@localhost:5432/postflow" };

describe("validateEnv", () => {
  it("fills in the defaults", () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.REDIS_URL).toBe("redis://localhost:6379");
    expect(env.WEB_ORIGIN).toBe("http://localhost:3000");
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

  it("reads TRUST_PROXY as a hop count when it is a number", () => {
    expect(validateEnv(base).TRUST_PROXY).toBe("loopback");
    expect(validateEnv({ ...base, TRUST_PROXY: "2" }).TRUST_PROXY).toBe(2);
  });
});
