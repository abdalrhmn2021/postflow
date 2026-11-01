import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { Post } from "@/lib/types";

// What happened when the worker published the post:
//   published -> a link to it on each platform
//   failed    -> why (one line per platform, Meta's own words), and which platform already went out
// Meta's reasons come in English as Meta wrote them; our own two reasons are translated.
export function PublishOutcome({
  post,
  t,
}: {
  post: Pick<Post, "status" | "failReason" | "publications">;
  t: Dictionary["posts"];
}) {
  const out = post.publications.filter((p) => p.status === "PUBLISHED");

  if (post.status === "PUBLISHED" && out.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-good/30 bg-good/5 px-4 py-3 text-sm">
        <span className="font-medium text-good">{t.publishedOn}</span>
        {out.map((p) =>
          p.url ? (
            <a
              key={p.platform}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-line bg-card px-3 py-1 font-medium hover:border-accent"
            >
              {t.viewOn.replace("{platform}", t.platformNames[p.platform])} ↗
            </a>
          ) : (
            <span key={p.platform} className="rounded-full bg-card px-3 py-1">
              {t.platformNames[p.platform]}
            </span>
          ),
        )}
      </div>
    );
  }

  if (post.status !== "FAILED" || !post.failReason) return null;
  const known: Record<string, string> = {
    "The client's Facebook page isn't connected": t.failNotConnected,
    "Publishing isn't set up on the server (META_APP_ID)": t.failNotSetUp,
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-bad/30 bg-bad/5 px-4 py-3 text-sm">
      <p className="font-medium text-bad">{t.failReason}</p>
      <ul className="flex flex-col gap-1">
        {post.failReason.split("\n").map((line) => (
          <li key={line} dir="auto" className="break-words">
            {known[line] ?? line}
          </li>
        ))}
      </ul>
      {out.map((p) => (
        <p key={p.platform} className="text-muted">
          {t.partlyPublished.replace("{platform}", t.platformNames[p.platform])}
          {p.url && (
            <>
              {" "}
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
                {t.viewOn.replace("{platform}", t.platformNames[p.platform])} ↗
              </a>
            </>
          )}
        </p>
      ))}
    </div>
  );
}
