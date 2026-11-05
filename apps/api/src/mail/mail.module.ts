import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { BrevoMailer } from "./brevo.mailer.js";
import { LogMailer } from "./log.mailer.js";
import { Mailer } from "./mailer.js";

// @Global: any feature that sends an email injects Mailer.
// The e2e tests replace it: builder.overrideProvider(Mailer).useValue(new FakeMailer()).
@Global()
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const email = config.get("EMAIL", { infer: true });
        return email ? new BrevoMailer(email) : new LogMailer();
      },
    },
  ],
  exports: [Mailer],
})
export class MailModule {}
