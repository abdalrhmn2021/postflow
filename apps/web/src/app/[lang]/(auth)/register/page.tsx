import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { RegisterForm } from "./RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.registerTitle };
}

export default async function RegisterPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.auth;
  return (
    <>
      <h1 className="text-2xl font-bold">{t.registerTitle}</h1>
      <p className="mt-1 text-muted">{t.registerSubtitle}</p>
      <RegisterForm locale={locale} t={t} errors={dict.errors} fields={dict.fields} />
      <p className="mt-6 text-center text-sm text-muted">
        {t.haveAccount}{" "}
        <Link href={`/${locale}/login`} className="font-semibold text-brand hover:underline">
          {t.loginLink}
        </Link>
      </p>
    </>
  );
}
