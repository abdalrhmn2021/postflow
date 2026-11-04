import type { Metadata } from "next";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { VerifyEmail } from "./VerifyEmail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).verify.doneTitle };
}

// The page the "confirm your email" mail opens: <site>/<lang>/verify-email/<secret>.
// The browser confirms it (POST) once the page is open - not the server while rendering it.
export default async function VerifyEmailPage({ params }: PageProps<"/[lang]/verify-email/[token]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<div className="h-40" />}>
      <Verify params={params} locale={locale} dict={dict} />
    </Suspense>
  );
}

async function Verify({
  params,
  locale,
  dict,
}: {
  params: Promise<{ token: string }>;
  locale: Locale;
  dict: Dictionary;
}) {
  const { token } = await params;
  return <VerifyEmail locale={locale} token={token} t={dict.verify} />;
}
