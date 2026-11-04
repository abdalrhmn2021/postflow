import type { Mail } from "./mailer.js";

// The emails PostFlow sends, in Arabic or English (the language of the page the person was on).
// Each one: a short text, one button with the link, and the link written out for mail programs
// that hide buttons. Plain inline styles: mail programs ignore <style> sheets and most CSS.

export type Lang = "ar" | "en";

type Recipient = { email: string; name: string };

const TEXT = {
  verify: {
    ar: {
      subject: "أكّد إيميلك في PostFlow",
      hello: (name: string) => `أهلاً ${name}،`,
      body: "اكبس على الزر عشان تأكد إن هاد إيميلك. الرابط بيشتغل 24 ساعة.",
      button: "أكّد الإيميل",
      ignore: "إذا ما عملت حساب في PostFlow، تجاهل هاد الإيميل.",
    },
    en: {
      subject: "Confirm your email for PostFlow",
      hello: (name: string) => `Hi ${name},`,
      body: "Press the button to confirm this is your email. The link works for 24 hours.",
      button: "Confirm email",
      ignore: "If you didn't sign up for PostFlow, ignore this email.",
    },
  },
  reset: {
    ar: {
      subject: "تغيير كلمة السر في PostFlow",
      hello: (name: string) => `أهلاً ${name}،`,
      body: "حدا طلب تغيير كلمة السر لحسابك. اكبس على الزر واختار كلمة سر جديدة. الرابط بيشتغل ساعة وحدة ولمرة وحدة.",
      button: "اختار كلمة سر جديدة",
      ignore: "إذا مش إنت اللي طلبت، تجاهل هاد الإيميل: كلمة السر ما رح تتغير.",
    },
    en: {
      subject: "Reset your PostFlow password",
      hello: (name: string) => `Hi ${name},`,
      body: "Someone asked to reset your account's password. Press the button to choose a new one. The link works once, for one hour.",
      button: "Choose a new password",
      ignore: "If it wasn't you, ignore this email: your password stays the same.",
    },
  },
} as const;

export function verifyEmailMail(to: Recipient, lang: Lang, link: string): Mail {
  return build(to, lang, link, TEXT.verify[lang]);
}

export function resetPasswordMail(to: Recipient, lang: Lang, link: string): Mail {
  return build(to, lang, link, TEXT.reset[lang]);
}

type Text = { subject: string; hello: (name: string) => string; body: string; button: string; ignore: string };

function build(to: Recipient, lang: Lang, link: string, t: Text): Mail {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
<body style="margin:0;padding:24px;background:#f8f6f1;font-family:Tahoma,Arial,sans-serif;color:#282828">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;direction:${dir};text-align:${lang === "ar" ? "right" : "left"}">
    <p style="margin:0 0 24px;font-size:20px;font-weight:bold">PostFlow</p>
    <p style="margin:0 0 12px;font-size:16px">${escapeHtml(t.hello(to.name))}</p>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.7">${escapeHtml(t.body)}</p>
    <p style="margin:0 0 24px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#8a6d2f;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:bold">${escapeHtml(t.button)}</a></p>
    <p style="margin:0 0 8px;font-size:13px;color:#6b655c;direction:ltr;text-align:left;word-break:break-all">${escapeHtml(link)}</p>
    <p style="margin:24px 0 0;font-size:13px;color:#6b655c">${escapeHtml(t.ignore)}</p>
  </div>
</body>
</html>`;
  const text = `${t.hello(to.name)}\n\n${t.body}\n\n${link}\n\n${t.ignore}`;
  return { to, subject: t.subject, html, text };
}

// The person's name is theirs to type: it must never become HTML in the email.
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
