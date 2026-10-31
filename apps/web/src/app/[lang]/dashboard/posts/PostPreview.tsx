import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { splitHashtags } from "@/lib/caption";
import type { Platform } from "@/lib/types";
import { formatInZone } from "@/lib/zoned-time";

type Props = {
  locale: Locale;
  t: Dictionary["posts"];
  brandName: string;
  timezone: string;
  caption: string;
  platforms: Platform[];
  scheduledAt: string | null;
};

// Roughly how the post will look on each platform it's going to, updated as the text is typed.
// A sketch of the layout, not a copy of Facebook's or Instagram's design.
// Facebook: the text above the picture. Instagram: a square picture, then the text after the page name.
export function PostPreview({ locale, t, brandName, timezone, caption, platforms, scheduledAt }: Props) {
  if (platforms.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-muted">
        {t.previewEmpty}
      </p>
    );
  }
  const time = scheduledAt ? formatInZone(scheduledAt, timezone, locale) : t.previewNoTime;

  return (
    <div className="flex flex-col gap-4">
      {platforms.map((platform) => (
        <article key={platform} className="overflow-hidden rounded-2xl border border-line bg-card text-sm">
          <header className="flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-brand font-bold text-on-brand"
            >
              {brandName.trim().charAt(0) || "?"}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-semibold">{brandName}</p>
              <p className="text-xs text-muted">{time}</p>
            </div>
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">{t.platformNames[platform]}</span>
          </header>

          {platform === "FACEBOOK" ? (
            <>
              <Caption caption={caption} empty={t.noCaption} className="px-4 pb-3" />
              <Media label={t.mediaSoon} className="aspect-video" />
            </>
          ) : (
            <>
              <Media label={t.mediaSoon} className="aspect-square" />
              <div className="px-4 py-3">
                <Caption caption={caption} empty={t.noCaption} lead={brandName} />
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}

function Caption({
  caption,
  empty,
  lead,
  className = "",
}: {
  caption: string;
  empty: string;
  lead?: string;
  className?: string;
}) {
  if (!caption.trim()) return <p className={`text-muted italic ${className}`}>{empty}</p>;
  return (
    <p dir="auto" className={`break-words whitespace-pre-wrap ${className}`}>
      {lead && <span className="me-1.5 font-semibold">{lead}</span>}
      {splitHashtags(caption).map((part, i) =>
        part.tag ? (
          <span key={i} className="text-brand">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}

function Media({ label, className }: { label: string; className: string }) {
  return (
    <div className={`grid place-items-center bg-surface text-xs text-muted ${className}`}>
      <span className="px-4 text-center">🖼️ {label}</span>
    </div>
  );
}
