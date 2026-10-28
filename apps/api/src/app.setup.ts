import type { NestExpressApplication } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import type { Env } from "./config/env.js";

// Everything main.ts sets on the app besides listening - shared with the e2e tests,
// so they run the API exactly as it runs for real.
export function setupApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config
      .get("WEB_ORIGIN", { infer: true })
      .split(",")
      .map((o) => o.trim()),
    credentials: true, // the login cookie
  });
  // req.ip = the visitor's IP even behind the Next.js site / a host's proxy (login attempt limit).
  app.set("trust proxy", config.get("TRUST_PROXY", { infer: true }));
  app.setGlobalPrefix("api");
  return app;
}
