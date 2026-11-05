import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { serverApiOrNull } from "@/lib/server-api";
import { ResetForm } from "./ResetForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.resetTitle };
}

// The page the reset email's link opens: <site>/<lang>/reset-password/<secret>.
// It asks the API whose link it is first, so a used or expired one says so before any typing.
export default async function ResetPasswordPage({ params }: PageProps<"/[lang]/reset-password/[token]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<div className="h-64" />}>
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
  const link = await serverApiOrNull<{ email: string }>(`/auth/reset-password/${encodeURIComponent(token)}`);
  const t = dict.auth;

  if (!link) {
    return (
      <>
        <h1 className="text-2xl font-bold">{t.resetInvalidTitle}</h1>
        <p className="mt-2 text-muted">{t.resetInvalidBody}</p>
        <p className="mt-6 text-center text-sm">
          <Link href={`/${locale}/forgot-password`} className="font-semibold text-brand hover:underline">
            {t.resetAgain}
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t.resetTitle}</h1>
      <p className="mt-1 text-muted">
        {t.resetFor.split("{email}")[0]}
        <bdi className="font-semibold text-ink">{link.email}</bdi>
        {t.resetFor.split("{email}")[1]}
      </p>
      <ResetForm locale={locale} token={token} t={t} errors={dict.errors} fields={dict.fields} />
    </>
  );
}
