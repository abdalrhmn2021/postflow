import { escapeHtml, resetPasswordMail, verifyEmailMail } from "./templates.js";

const to = { email: "ali@example.test", name: "علي" };

describe("email templates", () => {
  it("writes the email in the page's language, with the link as a button and as text", () => {
    const ar = verifyEmailMail(to, "ar", "https://site.test/ar/verify-email/abc");
    expect(ar.subject).toBe("أكّد إيميلك في PostFlow");
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.html).toContain('href="https://site.test/ar/verify-email/abc"');
    expect(ar.text).toContain("https://site.test/ar/verify-email/abc");
    expect(ar.to).toEqual(to);

    const en = resetPasswordMail(to, "en", "https://site.test/en/reset-password/xyz");
    expect(en.subject).toBe("Reset your PostFlow password");
    expect(en.html).toContain('dir="ltr"');
    expect(en.text).toContain("one hour");
  });

  it("never lets a name become HTML", () => {
    const mail = verifyEmailMail(
      { email: "x@y.test", name: '<img src=x onerror="alert(1)">' },
      "en",
      "https://s.test/l",
    );
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("escapes every special character", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
