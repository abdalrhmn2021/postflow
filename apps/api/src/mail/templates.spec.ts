import { escapeHtml, resetPasswordMessage, verifyEmailMessage } from "./templates.js";

describe("email templates", () => {
  const to = { email: "sara@agency.test", name: "سارة" };
  const link = "https://postflow.test/ar/verify-email/abc";

  it("writes the confirmation email in Arabic, right to left, with the link", () => {
    const m = verifyEmailMessage("ar", to, link);
    expect(m.subject).toBe("أكّد إيميلك على PostFlow");
    expect(m.html).toContain('dir="rtl"');
    expect(m.html).toContain(`href="${link}"`);
    expect(m.html).toContain("أهلاً سارة");
    expect(m.text).toContain(link);
    expect(m.link).toBe(link);
    expect(m.to).toEqual(to);
  });

  it("writes the reset email in English, left to right", () => {
    const m = resetPasswordMessage("en", to, "https://postflow.test/en/reset-password/xyz");
    expect(m.subject).toBe("Reset your PostFlow password");
    expect(m.html).toContain('dir="ltr"');
    expect(m.text).toContain("one hour");
  });

  it("doesn't let a name add HTML to the email", () => {
    const m = verifyEmailMessage("en", { email: "x@y.test", name: '<a href="https://evil.test">click</a>' }, link);
    expect(m.html).not.toContain('<a href="https://evil.test">');
    expect(m.html).toContain("&lt;a href=&quot;https://evil.test&quot;&gt;");
    expect(escapeHtml(`'&`)).toBe("&#39;&amp;");
  });
});
