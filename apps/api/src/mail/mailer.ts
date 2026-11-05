// One email, ready to go: already in the person's language (templates.ts).
export type EmailMessage = {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string; // the same, for email apps that don't show HTML
  link: string; // the one link in it - printed by LogMailer, read by the e2e tests
};

// PostFlow's emails, as the rest of the API sees them. The app uses Brevo when BREVO_API_KEY is set
// (brevo.mailer.ts), and otherwise prints the link in the terminal (log.mailer.ts); the e2e tests
// swap in a fake that keeps what was sent. An abstract class so it can be the Nest injection token.
export abstract class Mailer {
  // false = emails are only printed, not sent (no BREVO_API_KEY).
  abstract readonly sends: boolean;

  // Throws when the email couldn't be handed over. Callers that answer the same either way
  // (forgot password) catch and log it.
  abstract send(message: EmailMessage): Promise<void>;
}
