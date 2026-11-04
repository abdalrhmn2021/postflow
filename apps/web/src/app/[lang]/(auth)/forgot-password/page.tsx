import type { Metadata } from "next";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { ForgotForm } from "./ForgotForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).forgot.title };
}

// "Forgot your password?" - the email, and we send a link (reset-password/[token]).
export default async function ForgotPasswordPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <ForgotForm locale={locale} t={dict.forgot} errors={dict.errors} fields={dict.fields} email={dict.auth.email} />
  );
}
