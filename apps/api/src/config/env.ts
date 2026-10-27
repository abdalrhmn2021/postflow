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
});

export type Env = z.infer<typeof envSchema>;

// Used by ConfigModule.forRoot({ validate }). Returns the cleaned values (defaults filled in, PORT a number).
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${problems.join("\n")}\nSee .env.example.`);
  }
  return result.data;
}
