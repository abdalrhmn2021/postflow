import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { ForgotForm } from "./ForgotForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.forgotTitle };
}

// "Forgot your password?" from the login page: the person types their email and gets a reset link.
export default async function ForgotPasswordPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.auth;
  return (
    <>
      <ForgotForm locale={locale} t={t} errors={dict.errors} fields={dict.fields} />
      <p className="mt-6 text-center text-sm">
        <Link href={`/${locale}/login`} className="font-semibold text-brand hover:underline">
          {t.backToLogin}
        </Link>
      </p>
    </>
  );
}
