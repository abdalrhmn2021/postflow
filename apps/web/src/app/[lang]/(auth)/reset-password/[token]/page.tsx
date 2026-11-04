import type { Metadata } from "next";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { ResetForm } from "./ResetForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).reset.title };
}

// The page the "forgot password" email opens: <site>/<lang>/reset-password/<secret>.
// Opening it changes nothing (mail programs open links to check them): only the form uses the link.
export default async function ResetPasswordPage({ params }: PageProps<"/[lang]/reset-password/[token]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<div className="h-72" />}>
      <Reset params={params} locale={locale} dict={dict} />
    </Suspense>
  );
}

async function Reset({
  params,
  locale,
  dict,
}: {
  params: Promise<{ token: string }>;
  locale: Locale;
  dict: Dictionary;
}) {
  const { token } = await params;
  return (
    <ResetForm
      locale={locale}
      token={token}
      t={dict.reset}
      errors={dict.errors}
      fields={dict.fields}
      hint={dict.auth.passwordHint}
    />
  );
}
