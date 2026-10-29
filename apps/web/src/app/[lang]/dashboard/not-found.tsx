import { ButtonLink } from "@/components/ui/Button";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";

// Shown inside the dashboard (top bar and all) when a page calls notFound(): e.g. a client that was
// deleted, belongs to another agency, or an editor isn't on (the API answers 404 for all three).
export default async function DashboardNotFound() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.dashboard;
  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold">{t.notFoundTitle}</h1>
      <p className="mt-2 text-muted">{t.notFoundBody}</p>
      <ButtonLink href={`/${locale}/dashboard`} variant="secondary" className="mt-6">
        {t.backHome}
      </ButtonLink>
    </section>
  );
}
