import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import type { App } from "supertest/types.js";
import { AppModule } from "../src/app.module.js";

// The whole API, as main.ts builds it, for the e2e tests. Runs against a real PostgreSQL and Redis
// (DATABASE_URL and REDIS_URL from the environment or apps/api/.env).
// `override` swaps a provider, e.g. a Redis that is down.
export async function startApp(override?: (b: ReturnType<typeof Test.createTestingModule>) => void) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  override?.(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  await app.init();
  return app as INestApplication<App>;
}
