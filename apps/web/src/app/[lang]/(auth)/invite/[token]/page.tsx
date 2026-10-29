import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { serverApiOrNull } from "@/lib/server-api";
import type { InvitePreview } from "@/lib/types";
import { AcceptForm } from "./AcceptForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).invite.title };
}

// The page an invite link opens: <site>/invite/<secret> (proxy.ts adds the language).
// It asks the API what the invite is for, then the person picks a name and a password and is logged in.
// A used, cancelled or expired link (the API answers 404 for all of them) gets one clear message.
export default async function InvitePage({ params }: PageProps<"/[lang]/invite/[token]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <Suspense fallback={<div className="h-80" />}>
      <Invite params={params} locale={locale} dict={dict} />
    </Suspense>
  );
}

async function Invite({
  params,
  locale,
  dict,
}: {
  params: Promise<{ token: string }>;
  locale: Locale;
  dict: Dictionary;
}) {
  const { token } = await params;
  const invite = await serverApiOrNull<InvitePreview>(`/invites/accept/${encodeURIComponent(token)}`);
  const t = dict.invite;

  if (!invite) {
    return (
      <>
        <h1 className="text-2xl font-bold">{t.invalidTitle}</h1>
        <p className="mt-2 text-muted">{t.invalidBody}</p>
        <p className="mt-6 text-center text-sm text-muted">
          {t.haveAccount}{" "}
          <Link href={`/${locale}/login`} className="font-semibold text-brand hover:underline">
            {t.loginLink}
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold">{t.heading.replace("{agency}", invite.agency.name)}</h1>
      <p className="mt-1 text-muted">{t.asRole.replace("{role}", dict.dashboard.roles[invite.role])}</p>
      <AcceptForm locale={locale} token={token} email={invite.email} t={t} errors={dict.errors} fields={dict.fields} />
    </>
  );
}
