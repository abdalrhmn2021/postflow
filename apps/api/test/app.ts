import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";
import { setupApp } from "../src/app.setup.js";

// The whole API, set up exactly like main.ts, for the e2e tests. Runs against a real PostgreSQL and
// Redis (DATABASE_URL and REDIS_URL from the environment or apps/api/.env).
// `override` swaps a provider, e.g. a Redis that is down.
export async function startApp(override?: (b: ReturnType<typeof Test.createTestingModule>) => void) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  override?.(builder);
  const moduleRef = await builder.compile();
  const app = setupApp(moduleRef.createNestApplication<NestExpressApplication>());
  await app.init();
  return app as unknown as INestApplication<App>;
}

// A name for the data one test file makes (agency slugs, emails), e.g. "e2e-mhb2k3ab-9f1c2d7e".
// The random part keeps two files that start in the same millisecond apart, so one file's
// afterAll never deletes another file's agencies. Short enough for the 40-character slug limit.
export function uniqueRun() {
  return `e2e-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}
