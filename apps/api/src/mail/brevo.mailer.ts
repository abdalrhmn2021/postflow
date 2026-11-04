import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.js";
import { Mailer, type Mail } from "./mailer.js";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

// Sends through Brevo's HTTP API (free plan: 300 emails a day). HTTP, not SMTP: Render's free plan
// blocks the SMTP ports. The sender (MAIL_FROM) must be verified in Brevo first:
// Brevo -> Senders, Domains & Dedicated IPs -> Senders -> Add a sender -> click the link Brevo emails you.
@Injectable()
export class BrevoMailer extends Mailer {
  readonly configured = true;
  private readonly apiKey: string;
  private readonly from: { email: string; name: string };

  constructor(config: ConfigService<Env, true>) {
    super();
    const mail = config.get("MAIL", { infer: true })!;
    this.apiKey = mail.brevoApiKey;
    this.from = { email: mail.from, name: mail.fromName };
  }

  async send({ to, subject, html }: Mail): Promise<void> {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": this.apiKey, "content-type": "application/json", accept: "application/json" },
      // One body type per email, Brevo says: the HTML one (every mail program shows it).
      body: JSON.stringify({ sender: this.from, to: [to], subject, htmlContent: html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Brevo answered ${res.status}: ${detail.slice(0, 300)}`);
    }
  }
}
