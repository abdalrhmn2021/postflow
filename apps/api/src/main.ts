import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { setupApp } from "./app.setup.js";
import type { Env } from "./config/env.js";
import { WorkerModule } from "./worker/worker.module.js";

async function bootstrap() {
  const app = setupApp(await NestFactory.create<NestExpressApplication>(AppModule));
  // Closes the database and Redis connections on Ctrl+C / a redeploy, instead of cutting them.
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get("NODE_ENV", { infer: true }) === "production" && !config.get("META", { infer: true })) {
    new Logger("Startup").warn("META_APP_ID / META_APP_SECRET aren't set: scheduled posts will fail at their time");
  }

  // RUN_WORKER=true: the publish worker in this same process (a free host has room for one service).
  // Its own Nest context - its own database and Redis connections - exactly as `npm run worker` runs it.
  if (config.get("RUN_WORKER", { infer: true })) {
    const worker = await NestFactory.createApplicationContext(WorkerModule);
    worker.enableShutdownHooks();
    console.log("PostFlow worker running inside the API (RUN_WORKER=true)");
  }

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
  console.log(`PostFlow API on http://localhost:${port}/api`);
}

await bootstrap();
