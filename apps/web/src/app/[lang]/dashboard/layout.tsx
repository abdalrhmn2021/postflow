import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession } from "@/lib/session";
import { LogoutButton } from "./LogoutButton";

// Every dashboard page: a top bar (logo, agency, who's logged in, language, log out) and the page below.
// proxy.ts already sent visitors without a login cookie to /login; getSession() checks the cookie is valid.
// The bar's static part shows at once; the part that needs the login streams in (Suspense).
export default async function DashboardLayout({ children }: LayoutProps<"/[lang]/dashboard">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
          <Logo locale={locale} />
          <Suspense fallback={<div className="flex-1" />}>
            <UserBar />
          </Suspense>
          <LanguageSwitch current={locale} label={dict.common.switchLanguage} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

async function UserBar() {
  const [locale, dict, { user, agency }] = await Promise.all([getLocale(), getDictionary(), getSession()]);
  const t = dict.dashboard;
  return (
    <>
      <span className="truncate border-s border-line ps-4 font-semibold">{agency.name}</span>
      <div className="ms-auto flex items-center gap-3">
        <div className="hidden text-end leading-tight sm:block">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted">{t.roles[user.role]}</p>
        </div>
        <LogoutButton locale={locale} label={t.logout} />
      </div>
    </>
  );
}
