import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession, serverApi } from "@/lib/server-api";
import type { Post } from "@/lib/types";
import { brandOptions } from "../brand-options";
import { PostEditor } from "../PostEditor";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).posts.editTitle };
}

// One post. A post of another agency, or of a client an editor isn't on, is a 404 from the API
// -> the not-found page. What may be changed depends on the role and the post's status (PostEditor).
export default async function PostPage({ params }: PageProps<"/[lang]/dashboard/posts/[id]">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/${locale}/dashboard/posts`} className="text-sm text-muted hover:text-ink">
        {dict.posts.back}
      </Link>
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-2xl bg-line/50" />}>
        <EditPost locale={locale} dict={dict} params={params} />
      </Suspense>
    </div>
  );
}

async function EditPost({
  locale,
  dict,
  params,
}: {
  locale: Locale;
  dict: Dictionary;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [{ user }, post, brands] = await Promise.all([
    getSession(),
    serverApi<Post>(`/posts/${encodeURIComponent(id)}`),
    brandOptions(locale),
  ]);
  return (
    <PostEditor
      // A new key per post: opening another post starts the editor afresh.
      key={post.id}
      locale={locale}
      t={dict.posts}
      errors={dict.errors}
      fields={dict.fields}
      role={user.role}
      brands={brands}
      post={post}
    />
  );
}
