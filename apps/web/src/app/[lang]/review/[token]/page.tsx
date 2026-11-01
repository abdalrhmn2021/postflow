import type { Metadata } from "next";
import { Suspense } from "react";
import { LocalDate } from "@/components/LocalDate";
import { Logo } from "@/components/Logo";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { serverApiOrNull } from "@/lib/server-api";
import type { ReviewPage, ReviewPost } from "@/lib/types";
import { formatInZone } from "@/lib/zoned-time";
import { PostPreview } from "../../dashboard/posts/PostPreview";
import { ReviewActions } from "./ReviewActions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).approval.linkTitle, robots: { index: false } };
}

// The page a review link opens: <site>/<lang>/review/<secret>. The client - no account - sees the
// posts the agency sent them, as they'll look on Facebook and Instagram, and answers each one.
// A wrong, stopped or expired link (404 from the API) gets one clear message.
export default async function ReviewRoute({ params }: PageProps<"/[lang]/review/[token]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-line/50" />}>
        <Review params={params} locale={locale} dict={dict} />
      </Suspense>
      <footer className="mt-auto flex items-center justify-center gap-2 text-xs text-muted">
        <span>{dict.review.poweredBy}</span>
        <Logo locale={locale} />
      </footer>
    </main>
  );
}

async function Review({
  params,
  locale,
  dict,
}: {
  params: Promise<{ token: string }>;
  locale: Locale;
  dict: Dictionary;
}) {
  const { token } = await params;
  const page = await serverApiOrNull<ReviewPage>(`/review/${encodeURIComponent(token)}`);
  const t = dict.review;

  if (!page) {
    return (
      <section className="rounded-2xl border border-line bg-card p-8 text-center">
        <h1 className="text-2xl font-bold">{t.invalidTitle}</h1>
        <p className="mt-2 text-muted">{t.invalidText}</p>
      </section>
    );
  }

  const waiting = page.posts.filter((p) => p.approval === "PENDING");
  const answered = page.posts.filter((p) => p.approval !== "PENDING");
  const card = (post: ReviewPost) => (
    <li key={post.id} className="grid gap-5 rounded-2xl border border-line bg-card p-5 md:grid-cols-[20rem_1fr]">
      <PostPreview
        locale={locale}
        t={dict.posts}
        brandName={page.brand.name}
        timezone={page.brand.timezone}
        caption={post.caption}
        platforms={post.platforms}
        scheduledAt={post.scheduledAt}
        media={post.media}
      />
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {post.scheduledAt
            ? t.when.replace("{time}", formatInZone(post.scheduledAt, page.brand.timezone, locale))
            : t.noTime}
        </p>
        <ReviewActions token={token} post={post} t={t} errors={dict.errors} fields={dict.fields} />
      </div>
    </li>
  );

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t.title.replace("{brand}", page.brand.name)}</h1>
        <p className="text-muted">{t.subtitle.replace("{agency}", page.brand.agency.name)}</p>
        <p className="text-xs text-muted">
          {t.expires.split("{date}")[0]}
          <LocalDate value={page.expiresAt} locale={locale} />
          {t.expires.split("{date}")[1]}
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">
          {t.waiting} ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-card px-6 py-10 text-center text-muted">
            {t.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">{waiting.map(card)}</ul>
        )}
      </section>

      {answered.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-muted">{t.answered}</h2>
          <ul className="flex flex-col gap-4">{answered.map(card)}</ul>
        </section>
      )}
    </>
  );
}
