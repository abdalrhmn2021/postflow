import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config
      .get("WEB_ORIGIN", { infer: true })
      .split(",")
      .map((o) => o.trim()),
    credentials: true, // the login cookie (phase 1)
  });
  app.setGlobalPrefix("api");
  // Closes the database and Redis connections on Ctrl+C / a redeploy, instead of cutting them.
  app.enableShutdownHooks();

  const port = config.get("PORT", { infer: true });
  await app.listen(port);
  console.log(`PostFlow API on http://localhost:${port}/api`);
}

await bootstrap();
