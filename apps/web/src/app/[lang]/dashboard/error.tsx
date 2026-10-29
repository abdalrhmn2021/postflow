"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

// Shown when a dashboard page fails to load (usually: the API isn't running or the database is asleep).
// An error page can't load the dictionary like a Server Component, so its two texts live here.
const TEXT = {
  ar: {
    title: "ما قدرنا نحمّل الصفحة",
    body: "السيرفر مش واصل هلّق. استنى لحظة وجرّب مرة ثانية.",
    retry: "جرّب مرة ثانية",
  },
  en: {
    title: "Couldn't load this page",
    body: "The server can't be reached right now. Wait a moment and try again.",
    retry: "Try again",
  },
};

export default function DashboardError({ retry }: { error: Error; retry: () => void }) {
  const { lang } = useParams<{ lang: string }>();
  const t = lang === "en" ? TEXT.en : TEXT.ar;
  return (
    <section role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-bold">{t.title}</h1>
      <p className="mt-2 text-muted">{t.body}</p>
      <Button onClick={retry} className="mt-6">
        {t.retry}
      </Button>
    </section>
  );
}
