import type { EmailMessage } from "../src/mail/mailer.js";
import { Mailer } from "../src/mail/mailer.js";

// Brevo, played by an array - for the e2e tests (no account, no network, no real inbox).
// `failing`: send() throws, like Brevo refusing the key.
export class FakeMailer extends Mailer {
  readonly sends = true;
  readonly sent: EmailMessage[] = [];
  failing = false;

  send(message: EmailMessage): Promise<void> {
    if (this.failing) return Promise.reject(new Error("Brevo refused the email: HTTP 401"));
    this.sent.push(message);
    return Promise.resolve();
  }

  // Every email sent to this address, oldest first.
  to(email: string) {
    return this.sent.filter((m) => m.to.email === email);
  }

  // The secret at the end of the newest link sent to this address (…/reset-password/<token>).
  lastToken(email: string): string | undefined {
    return this.to(email).at(-1)?.link.split("/").pop();
  }
}
