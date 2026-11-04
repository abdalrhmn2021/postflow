// What the API needs from an email service: send one email. BrevoMailer sends it for real;
// ConsoleMailer (development, or no BREVO_API_KEY) prints it to the log instead.
// The e2e tests swap in FakeMailer (test/fake-mailer.ts), which keeps the emails to read the links.
export type Mail = {
  to: { email: string; name: string };
  subject: string;
  html: string;
  text: string; // the same email as plain text - what ConsoleMailer prints
};

export abstract class Mailer {
  // true = emails really leave the server (an email service is set up).
  abstract readonly configured: boolean;
  // Throws when the email service refuses or doesn't answer.
  abstract send(mail: Mail): Promise<void>;
}
