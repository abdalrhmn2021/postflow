import { z } from "zod";

// Every setting the API and the worker read from the environment, checked once at start-up.
// A missing or wrong value stops the process with a clear message (fail-fast, like BookFlow),
// instead of crashing later in the middle of a request or a scheduled publish.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  // postgresql://user:password@host:5432/database
  DATABASE_URL: z
    .preprocess(cleanUrl, z.string())
    .pipe(z.string().min(1, "DATABASE_URL is required"))
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must start with postgresql://"),

  // redis://host:6379 (rediss:// for TLS, e.g. Upstash)
  REDIS_URL: z
    .preprocess(cleanUrl, z.string().default("redis://localhost:6379"))
    .refine((v) => /^rediss?:\/\//.test(v), "REDIS_URL must start with redis:// or rediss://")
    // Upstash only answers over TLS: with redis:// every connection is cut (ECONNRESET), forever.
    .refine(
      (v) => !/^redis:\/\/[^/]*\.upstash\.io(:\d+)?\/?$/.test(v),
      "Upstash needs rediss:// (two s - TLS), not redis://",
    ),
  // Put in front of every Redis key (sessions, limits, the publish queue), so development, the tests
  // and production can share ONE Redis database (Upstash's free plan has one) without ever seeing each
  // other's keys or jobs. Empty = from NODE_ENV: "dev", "test" or "prod" - usually nothing to set.
  REDIS_PREFIX: z.preprocess(
    emptyIsUnset,
    z
      .string()
      .regex(/^[\w-]{1,32}$/, "REDIS_PREFIX: letters, digits, - and _ only")
      .optional(),
  ),

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

  // Where post images and videos are stored: the "API environment variable" from the Cloudinary
  // dashboard, cloudinary://<api_key>:<api_secret>@<cloud_name>. Optional: without it everything
  // works except uploads, which answer 503 MEDIA_NOT_CONFIGURED. Empty counts as not set.
  CLOUDINARY_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .transform((v, ctx) => {
        const parsed = parseCloudinaryUrl(v);
        if (!parsed) {
          ctx.addIssue({ code: "custom", message: "Must look like cloudinary://<api_key>:<api_secret>@<cloud_name>" });
          return z.NEVER;
        }
        return parsed;
      })
      .optional(),
  ),

  // The Meta app (developers.facebook.com -> the app -> App settings -> Basic) that connects clients'
  // Facebook pages and Instagram accounts. Both or neither. Without them connecting is off and posts
  // can be scheduled without a connected page, and fail at their time (a warning at start in production).
  META_APP_ID: z.preprocess(emptyIsUnset, z.string().regex(/^\d+$/, "META_APP_ID is a number").optional()),
  META_APP_SECRET: z.preprocess(emptyIsUnset, z.string().min(16, "META_APP_SECRET looks too short").optional()),
  // The Graph API version every call uses. Meta keeps each version about two years.
  META_GRAPH_VERSION: z
    .string()
    .regex(/^v\d+\.\d$/, "META_GRAPH_VERSION looks like v24.0")
    .default("v24.0"),

  // "true": the API process runs the publish worker too - one service instead of two, for a free
  // host. Leave it off (the default) when the worker runs as its own service (npm run worker).
  RUN_WORKER: z
    .enum(["true", "false", ""], "RUN_WORKER is true or false")
    .default("false")
    .transform((v) => v === "true"),

  // Writes caption ideas (phase 6): a Google AI Studio key (aistudio.google.com -> Get API key).
  // Empty = the "write a caption" button says it isn't set up; everything else works.
  GEMINI_API_KEY: z.preprocess(emptyIsUnset, z.string().min(20, "GEMINI_API_KEY looks too short").optional()),
  // Which model. The alias follows Google's newest Flash model, so it doesn't stop working when one is retired.
  GEMINI_MODEL: z
    .string()
    .regex(/^[\w.-]+$/, "GEMINI_MODEL is a model name")
    .default("gemini-flash-latest"),

  // Encrypts the pages' access tokens in the database (AES-256-GCM): 32 random bytes, base64.
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  // Optional in development (a fixed dev key); required in production. Changing it alone makes every
  // stored token unreadable (the clients' pages must be connected again) - see the next setting.
  TOKEN_ENCRYPTION_KEY: z.preprocess(
    emptyIsUnset,
    z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY must be 32 bytes in base64")
      .optional(),
  ),
  // Changing the key without losing the pages (DEPLOY.md, "Changing TOKEN_ENCRYPTION_KEY"): put the
  // old key here and the new one in TOKEN_ENCRYPTION_KEY. Tokens still locked with the old key keep
  // working, and the worker re-encrypts them with the new one. Once its log says they're all done,
  // remove this.
  TOKEN_ENCRYPTION_KEY_PREVIOUS: z.preprocess(
    emptyIsUnset,
    z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "TOKEN_ENCRYPTION_KEY_PREVIOUS must be 32 bytes in base64")
      .optional(),
  ),
});

function emptyIsUnset(v: unknown) {
  return v === "" ? undefined : v;
}

// A URL pasted into a host's form often comes with spaces, a line break or quotes around it:
// "  'rediss://...'\n" -> rediss://... Empty counts as not set (the default applies).
export function cleanUrl(v: unknown) {
  if (typeof v !== "string") return v;
  const cleaned = v
    .trim()
    .replace(/^(["'])(.*)\1$/s, "$2")
    .trim();
  return cleaned === "" ? undefined : cleaned;
}

// rediss://default:SECRET@host:6379 -> rediss://default:***@host:6379 - safe to print in logs.
export function hidePassword(url: string) {
  return url.replace(/^([a-z][\w+.-]*:\/\/[^:/@\s]*:)[^@\s]+@/i, "$1***@");
}

export type MetaConfig = { appId: string; appSecret: string; graphVersion: string };

export type CloudinaryConfig = { cloudName: string; apiKey: string; apiSecret: string };

// cloudinary://123456789012345:AbCdEf-gHiJ@my-cloud -> { cloudName, apiKey, apiSecret }, or null.
export function parseCloudinaryUrl(value: string): CloudinaryConfig | null {
  const match = /^cloudinary:\/\/([^:@/\s]+):([^@/\s]+)@([\w-]+)$/.exec(value.trim());
  if (!match) return null;
  const [, apiKey, apiSecret, cloudName] = match;
  return { cloudName, apiKey, apiSecret };
}

const DEV_JWT_SECRET = "postflow-development-only-secret-do-not-use-in-production";
// 32 bytes, base64. Only ever used when NODE_ENV isn't production.
const DEV_TOKEN_KEY = Buffer.from("postflow-dev-token-key-not-prod!").toString("base64");

const DEFAULT_REDIS_PREFIX = { development: "dev", test: "test", production: "prod" } as const;

type Parsed = z.infer<typeof envSchema>;
export type Env = Omit<
  Parsed,
  "JWT_SECRET" | "TOKEN_ENCRYPTION_KEY" | "META_APP_ID" | "META_APP_SECRET" | "REDIS_PREFIX"
> & {
  JWT_SECRET: string;
  REDIS_PREFIX: string; // never empty: "dev", "test", "prod" or the value set
  TOKEN_ENCRYPTION_KEY: string;
  META: MetaConfig | undefined; // undefined = connecting pages is off
};

// Used by ConfigModule.forRoot({ validate }). Returns the cleaned values (defaults filled in, PORT a number).
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join(".") || "env"}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${problems.join("\n")}\nSee .env.example.`);
  }
  const { JWT_SECRET, TOKEN_ENCRYPTION_KEY, META_APP_ID, META_APP_SECRET, REDIS_PREFIX, ...env } = result.data;
  const production = env.NODE_ENV === "production";

  const problems: string[] = [];
  if (production && !JWT_SECRET) problems.push("JWT_SECRET: required in production");
  if (production && !TOKEN_ENCRYPTION_KEY) problems.push("TOKEN_ENCRYPTION_KEY: required in production");
  if (Boolean(META_APP_ID) !== Boolean(META_APP_SECRET)) {
    problems.push("META_APP_ID and META_APP_SECRET: set both, or neither");
  }
  if (problems.length > 0) {
    throw new Error(`Invalid environment variables:\n${problems.map((p) => `  - ${p}`).join("\n")}\nSee .env.example.`);
  }

  return {
    ...env,
    REDIS_PREFIX: REDIS_PREFIX ?? DEFAULT_REDIS_PREFIX[env.NODE_ENV],
    JWT_SECRET: JWT_SECRET ?? DEV_JWT_SECRET,
    TOKEN_ENCRYPTION_KEY: TOKEN_ENCRYPTION_KEY ?? DEV_TOKEN_KEY,
    META:
      META_APP_ID && META_APP_SECRET
        ? { appId: META_APP_ID, appSecret: META_APP_SECRET, graphVersion: env.META_GRAPH_VERSION }
        : undefined,
  };
}
