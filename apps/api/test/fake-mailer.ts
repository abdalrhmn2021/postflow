import { Mailer, type Mail } from "../src/mail/mailer.js";

// Mailer for the e2e tests: keeps every email instead of sending it, so a test can open the link.
// startApp() puts it in place of the real one; a test reads it back with app.get(Mailer).
export class FakeMailer extends Mailer {
  readonly configured = true;
  readonly sent: Mail[] = [];
  failNext = false; // true = the next send throws, like an email service that's down

  send(mail: Mail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error("email service down"));
    }
    this.sent.push(mail);
    return Promise.resolve();
  }

  to(email: string): Mail[] {
    return this.sent.filter((m) => m.to.email === email);
  }

  // Some emails go out after the answer (forgot password, sign-up): wait for the n-th one to this address.
  async waitFor(email: string, count = 1, timeoutMs = 3000): Promise<Mail> {
    const until = Date.now() + timeoutMs;
    while (this.to(email).length < count) {
      if (Date.now() > until) throw new Error(`No email #${count} to ${email} within ${timeoutMs} ms`);
      await new Promise((r) => setTimeout(r, 20));
    }
    return this.to(email)[count - 1]!;
  }

  // The secret at the end of the email's link: .../verify-email/<token> or .../reset-password/<token>.
  static token(mail: Mail): string {
    const match = /\/(?:verify-email|reset-password)\/([\w-]+)/.exec(mail.text);
    if (!match) throw new Error(`No link in "${mail.subject}"`);
    return match[1]!;
  }
}
