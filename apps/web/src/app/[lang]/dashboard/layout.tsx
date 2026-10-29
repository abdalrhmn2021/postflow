import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession } from "@/lib/server-api";
import { LogoutButton } from "./LogoutButton";
import { NavBar, NavLinks } from "./NavLinks";

// Every dashboard page: a top bar (logo, agency, who's logged in, language, log out), the sections
// (home, clients, team) and the page below.
// proxy.ts already sent visitors without a login cookie to /login; getSession() checks the cookie is valid.
// The bar's static part shows at once; the part that needs the login streams in (Suspense).
export default async function DashboardLayout({ children }: LayoutProps<"/[lang]/dashboard">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const links = [
    { href: `/${locale}/dashboard`, label: dict.dashboard.nav.home, exact: true },
    { href: `/${locale}/dashboard/brands`, label: dict.dashboard.nav.brands },
  ];
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
        <Suspense fallback={<NavBar links={links} />}>
          <Sections links={links} team={{ href: `/${locale}/dashboard/team`, label: dict.dashboard.nav.team }} />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}

type Link = { href: string; label: string; exact?: boolean };

// The section links, plus "Team" for the owner and managers (the API doesn't show editors the team).
// NavLinks reads the URL to highlight the current section, which some pages only know when opened.
async function Sections({ links, team }: { links: Link[]; team: Link }) {
  const { user } = await getSession();
  const all = user.role === "EDITOR" ? links : [...links, team];
  return (
    <Suspense fallback={<NavBar links={all} />}>
      <NavLinks links={all} />
    </Suspense>
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
