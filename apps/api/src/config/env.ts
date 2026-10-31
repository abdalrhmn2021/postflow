import { z } from "zod";

// Every setting the API and the worker read from the environment, checked once at start-up.
// A missing or wrong value stops the process with a clear message (fail-fast, like BookFlow),
// instead of crashing later in the middle of a request or a scheduled publish.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  // postgresql://user:password@host:5432/database
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must start with postgresql://"),

  // redis://host:6379 (rediss:// for TLS, e.g. Upstash)
  REDIS_URL: z
    .string()
    .default("redis://localhost:6379")
    .refine((v) => /^rediss?:\/\//.test(v), "REDIS_URL must start with redis:// or rediss://"),

  // Where the Next.js site runs - the only origin allowed to call the API (comma-separated for several).
  WEB_ORIGIN: z.string().default("http://localhost:3000"),

  // Signs the login tokens. Anyone who knows it can log in as anyone, so: long, random, secret.
  // Make one with:  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  // Optional in development and tests (a fixed dev value is used); required in production - see below.
  // An empty value (JWT_SECRET= as in .env.example) counts as not set.
  JWT_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(32, "JWT_SECRET must be at least 32 characters").optional(),
  ),

  // Which proxies in front of the API to trust for the visitor's real IP (X-Forwarded-For), used to
  // limit login attempts per visitor. "loopback": the Next.js site on the same machine (development).
  // A number = that many proxy hops (set when deploying, phase 7).
  TRUST_PROXY: z
    .string()
    .default("loopback")
    .transform((v) => (/^\d+$/.test(v) ? Number(v) : v)),
});

const DEV_JWT_SECRET = "postflow-development-only-secret-do-not-use-in-production";

export type Env = Omit<z.infer<typeof envSchema>, "JWT_SECRET"> & { JWT_SECRET: string };

// Used by ConfigModule.forRoot({ validate }). Returns the cleaned values (defaults filled in, PORT a number).
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${problems.join("\n")}\nSee .env.example.`);
  }
  const env = result.data;
  if (!env.JWT_SECRET) {
    if (env.NODE_ENV === "production") {
      throw new Error("Invalid environment variables:\n  - JWT_SECRET: required in production\nSee .env.example.");
    }
    return { ...env, JWT_SECRET: DEV_JWT_SECRET };
  }
  return { ...env, JWT_SECRET: env.JWT_SECRET };
}
