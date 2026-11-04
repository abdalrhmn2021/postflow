import { Injectable, Logger } from "@nestjs/common";
import { Mailer, type Mail } from "./mailer.js";

// No email service set up (development): the email goes to the API's log, links included,
// so "forgot password" and "confirm your email" can be tried without any account anywhere.
@Injectable()
export class ConsoleMailer extends Mailer {
  readonly configured = false;
  private readonly logger = new Logger("Mail");

  send({ to, subject, text }: Mail): Promise<void> {
    this.logger.log(`(not sent - no BREVO_API_KEY) To: ${to.email}\nSubject: ${subject}\n\n${text}\n`);
    return Promise.resolve();
  }
}
