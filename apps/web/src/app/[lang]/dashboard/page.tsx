import type { Metadata } from "next";
import { Suspense } from "react";
import { getDictionary } from "@/i18n/get-dictionary";
import { getSession } from "@/lib/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).dashboard.title };
}

// The dashboard's first page. For now a welcome; clients and team come in the next step.
export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-20 w-full max-w-lg animate-pulse rounded-2xl bg-line/50" />}>
      <Welcome />
    </Suspense>
  );
}

async function Welcome() {
  const [dict, { user, agency }] = await Promise.all([getDictionary(), getSession()]);
  const t = dict.dashboard;
  return (
    <section>
      <h1 className="text-2xl font-bold">{t.welcome.replace("{name}", user.name)}</h1>
      <p className="mt-2 max-w-2xl text-muted">{t.intro.replace("{agency}", agency.name)}</p>
    </section>
  );
}
