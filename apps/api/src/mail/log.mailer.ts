import { Injectable, Logger } from "@nestjs/common";
import { Mailer, type EmailMessage } from "./mailer.js";

// No BREVO_API_KEY (development): nothing is sent, the link is printed in the API's terminal,
// so a password reset or an email confirmation can still be tried by copying it into the browser.
@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger("Email");
  readonly sends = false;

  send({ to, subject, link }: EmailMessage): Promise<void> {
    this.logger.log(`Not sent (no BREVO_API_KEY) - to ${to.email}: "${subject}"\n  ${link}`);
    return Promise.resolve();
  }
}
