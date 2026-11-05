import { Injectable, Logger } from "@nestjs/common";
import type { EmailConfig } from "../config/env.js";
import { Mailer, type EmailMessage } from "./mailer.js";

const API = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

// Brevo's transactional email API (free plan: 300 a day). One HTTP call per email, no package.
// The sender is EMAIL_FROM, verified in Brevo. A free address (gmail.com) can't be authenticated,
// so Brevo shows it as <something>@<id>.brevosend.com; replies still go to EMAIL_FROM (replyTo).
// With a domain of our own, authenticated in Brevo, the real address shows - nothing to change here.
@Injectable()
export class BrevoMailer extends Mailer {
  private readonly logger = new Logger("Email");
  readonly sends = true;

  constructor(private readonly config: EmailConfig) {
    super();
  }

  async send({ to, subject, html, text }: EmailMessage): Promise<void> {
    const { brevoApiKey, from, fromName } = this.config;
    let res: Response;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: { "api-key": brevoApiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { email: from, name: fromName },
          replyTo: { email: from, name: fromName },
          to: [to.name ? { email: to.email, name: to.name } : { email: to.email }],
          subject,
          htmlContent: html,
          textContent: text,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`Can't reach Brevo: ${(err as Error).message}`);
    }
    if (!res.ok) {
      // Brevo's reason: { code, message } - e.g. "unauthorized" (the key), a sender not verified.
      const reason = (await res.text().catch(() => "")).slice(0, 300);
      throw new Error(`Brevo refused the email: HTTP ${res.status} ${reason}`);
    }
    this.logger.log(`Sent "${subject}"`); // no address in the host's logs
  }
}
