import { Logo } from "@/components/Logo";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";

// The frame around /login and /register: logo and language at the top, the form in a card in the middle.
// (auth) is a route group - it shares this layout without adding to the URL.
export default async function AuthLayout({ children }: LayoutProps<"/[lang]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo locale={locale} />
        <LanguageSwitch current={locale} label={dict.common.switchLanguage} />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-2xl border border-line bg-card p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
