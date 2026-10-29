import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { LanguageSwitch } from "@/components/ui/LanguageSwitch";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";

// The front page: what PostFlow is, and the way in. Static - the same for every visitor.
export default async function Home() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.home;

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <span className="text-lg font-bold">
          Post<span className="text-accent">Flow</span>
        </span>
        <LanguageSwitch current={locale} label={dict.common.switchLanguage} />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <p className="text-sm font-semibold text-brand">{t.tagline}</p>
        <h1 className="text-4xl leading-tight font-bold text-balance sm:text-5xl">{t.title}</h1>
        <p className="text-lg text-pretty text-muted">{t.description}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/${locale}/register`}>{t.register}</ButtonLink>
          <ButtonLink href={`/${locale}/login`} variant="secondary">
            {t.login}
          </ButtonLink>
        </div>
      </main>

      <footer className="py-6 text-center text-sm text-muted">
        <Link href={`/${locale}/status`} className="hover:text-ink">
          {t.status}
        </Link>
      </footer>
    </div>
  );
}
