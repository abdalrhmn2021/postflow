import type { Metadata } from "next";
import { Suspense } from "react";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession } from "@/lib/server-api";
import { ChangePassword } from "./ChangePassword";
import { LogoutEverywhere } from "./LogoutEverywhere";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.title };
}

// The logged-in person's own page: who they are, and their logins.
export default async function AccountPage() {
  const dict = await getDictionary();
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{dict.account.title}</h1>
        <p className="mt-1 text-muted">{dict.account.subtitle}</p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-line/50" />}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const [locale, dict, { user, agency }] = await Promise.all([getLocale(), getDictionary(), getSession()]);
  const t = dict.account;
  const rows = [
    [t.name, user.name],
    [t.email, `${user.email} · ${user.emailVerified ? t.verified : t.notVerified}`],
    [t.role, dict.dashboard.roles[user.role]],
    [t.agency, agency.name],
  ];
  return (
    <>
      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="mb-4 font-semibold">{t.details}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className="font-medium break-all" dir="auto">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-line bg-card p-6">
        <h2 className="mb-4 font-semibold">{t.security}</h2>
        <div className="flex flex-col gap-8">
          <ChangePassword t={t} hint={dict.auth.passwordHint} errors={dict.errors} fields={dict.fields} />
          <div className="border-t border-line pt-6">
            <LogoutEverywhere locale={locale} t={t} errors={dict.errors} />
          </div>
        </div>
      </section>
    </>
  );
}
