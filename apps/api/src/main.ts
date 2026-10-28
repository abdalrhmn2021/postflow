import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module.js";
import { setupApp } from "./app.setup.js";
import type { Env } from "./config/env.js";

async function bootstrap() {
  const app = setupApp(await NestFactory.create<NestExpressApplication>(AppModule));
  // Closes the database and Redis connections on Ctrl+C / a redeploy, instead of cutting them.
  app.enableShutdownHooks();

  const port = app.get<ConfigService<Env, true>>(ConfigService).get("PORT", { infer: true });
  await app.listen(port);
  console.log(`PostFlow API on http://localhost:${port}/api`);
}

await bootstrap();
