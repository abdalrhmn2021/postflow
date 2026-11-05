import type { EmailMessage } from "./mailer.js";

export type Lang = "ar" | "en";

type Recipient = { email: string; name: string };

// What each email says, in both languages. {name} is the person's name.
const TEXT = {
  verify: {
    ar: {
      subject: "أكّد إيميلك على PostFlow",
      hello: "أهلاً {name}،",
      body: "اكبس الزر تحت عشان تأكّد إنه هاد إيميلك. الرابط صالح لمدة 24 ساعة.",
      button: "أكّد الإيميل",
      ignore: "إذا ما سجّلت على PostFlow، تجاهل هاد الإيميل.",
    },
    en: {
      subject: "Confirm your email on PostFlow",
      hello: "Hi {name},",
      body: "Click the button below to confirm this is your email. The link works for 24 hours.",
      button: "Confirm email",
      ignore: "If you didn't sign up for PostFlow, you can ignore this email.",
    },
  },
  reset: {
    ar: {
      subject: "تغيير كلمة السر على PostFlow",
      hello: "أهلاً {name}،",
      body: "وصلنا طلب لتغيير كلمة السر تبعتك. اكبس الزر تحت واختار كلمة سر جديدة. الرابط صالح لمدة ساعة، ولمرة وحدة بس.",
      button: "اختار كلمة سر جديدة",
      ignore: "إذا مش إنت اللي طلبت، تجاهل هاد الإيميل: كلمة السر ما رح تتغيّر.",
    },
    en: {
      subject: "Reset your PostFlow password",
      hello: "Hi {name},",
      body: "We got a request to reset your password. Click the button below to choose a new one. The link works for one hour, once.",
      button: "Choose a new password",
      ignore: "If you didn't ask for this, ignore this email: your password won't change.",
    },
  },
} as const;

// Text that came from a person (their name) can't add HTML to the email.
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function build(kind: keyof typeof TEXT, lang: Lang, to: Recipient, link: string): EmailMessage {
  const t = TEXT[kind][lang];
  const hello = t.hello.replace("{name}", to.name);
  const dir = lang === "ar" ? "rtl" : "ltr";
  const align = lang === "ar" ? "right" : "left";

  // Tables and inline styles: what every email app (Gmail, Outlook, phones) shows the same way.
  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<body style="margin:0;padding:0;background:#f8f6f1;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6f1;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px;font-family:Tahoma,Arial,sans-serif;color:#282828;text-align:${align};" dir="${dir}">
        <tr><td style="font-size:20px;font-weight:bold;padding-bottom:24px;">PostFlow</td></tr>
        <tr><td style="font-size:16px;padding-bottom:8px;">${escapeHtml(hello)}</td></tr>
        <tr><td style="font-size:15px;line-height:1.7;padding-bottom:24px;">${escapeHtml(t.body)}</td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#8a6d2f;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:10px;">${escapeHtml(t.button)}</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#6b655c;line-height:1.6;padding-bottom:8px;word-break:break-all;" dir="ltr">${escapeHtml(link)}</td></tr>
        <tr><td style="font-size:13px;color:#6b655c;line-height:1.6;">${escapeHtml(t.ignore)}</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [hello, "", t.body, "", link, "", t.ignore].join("\n");
  return { to: { email: to.email, name: to.name }, subject: t.subject, html, text, link };
}

export const verifyEmailMessage = (lang: Lang, to: Recipient, link: string) => build("verify", lang, to, link);
export const resetPasswordMessage = (lang: Lang, to: Recipient, link: string) => build("reset", lang, to, link);
