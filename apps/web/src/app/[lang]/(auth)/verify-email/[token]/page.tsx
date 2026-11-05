import type { Metadata } from "next";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { VerifyEmail } from "./VerifyEmail";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).auth.verifyTitle };
}

// The page the confirmation email's link opens: <site>/<lang>/verify-email/<secret>.
// Works without a login - the link may be opened on a phone where the person isn't logged in.
export default async function VerifyEmailPage({ params }: PageProps<"/[lang]/verify-email/[token]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<p className="text-muted">{dict.auth.verifying}</p>}>
      <Verify params={params} locale={locale} t={dict.auth} />
    </Suspense>
  );
}

async function Verify({
  params,
  locale,
  t,
}: {
  params: Promise<{ token: string }>;
  locale: Locale;
  t: Dictionary["auth"];
}) {
  const { token } = await params;
  return <VerifyEmail locale={locale} token={token} t={t} />;
}
