import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { BrevoMailer } from "./brevo.mailer.js";
import { ConsoleMailer } from "./console.mailer.js";
import { Mailer } from "./mailer.js";

// @Global: anything that sends an email just injects Mailer.
// BREVO_API_KEY set -> Brevo, else the log. The e2e tests: overrideProvider(Mailer).useValue(new FakeMailer()).
@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get("MAIL", { infer: true }) ? new BrevoMailer(config) : new ConsoleMailer(),
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
