import type { Metadata } from "next";
import Link from "next/link";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { LoginForm } from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.loginTitle };
}

export default async function LoginPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.auth;
  return (
    <>
      <h1 className="text-2xl font-bold">{t.loginTitle}</h1>
      <p className="mt-1 text-muted">{t.loginSubtitle}</p>
      <LoginForm locale={locale} t={t} errors={dict.errors} fields={dict.fields} />
      <p className="mt-6 text-center text-sm text-muted">
        {t.noAccount}{" "}
        <Link href={`/${locale}/register`} className="font-semibold text-brand hover:underline">
          {t.registerLink}
        </Link>
      </p>
    </>
  );
}
