import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { splitHashtags } from "@/lib/caption";
import { previewUrl } from "@/lib/media";
import type { Platform, PostMedia } from "@/lib/types";
import { formatInZone } from "@/lib/zoned-time";

type Props = {
  locale: Locale;
  t: Dictionary["posts"];
  brandName: string;
  timezone: string;
  caption: string;
  platforms: Platform[];
  scheduledAt: string | null;
  media: PostMedia[];
};

// Roughly how the post will look on each platform it's going to, updated as the text is typed.
// A sketch of the layout, not a copy of Facebook's or Instagram's design.
// Facebook: the text above the pictures (a grid when there are several). Instagram: the first file
// at its own shape (as Instagram shows it, between 4:5 and 1.91:1), dots for a carousel, then the text.
export function PostPreview({ locale, t, brandName, timezone, caption, platforms, scheduledAt, media }: Props) {
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
              <FacebookMedia media={media} />
            </>
          ) : (
            <>
              <InstagramMedia media={media} empty={t.previewNeedsMedia} />
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

// One file filling its box. A video plays here (muted, with controls); Cloudinary sends it as MP4.
function MediaFile({ media, className = "" }: { media: PostMedia; className?: string }) {
  if (media.type === "VIDEO") {
    return (
      <video
        src={previewUrl(media)}
        controls
        muted
        playsInline
        preload="metadata"
        className={`size-full bg-black object-contain ${className}`}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already sends a resized copy
  return <img src={previewUrl(media)} alt="" className={`size-full object-cover ${className}`} />;
}

// Facebook: no files is fine (a text post). One file at its shape; several as a grid of up to 4.
function FacebookMedia({ media }: { media: PostMedia[] }) {
  if (media.length === 0) return null;
  if (media.length === 1) {
    const [m] = media;
    return (
      <div className="bg-surface" style={{ aspectRatio: `${m.width} / ${m.height}`, maxHeight: "28rem" }}>
        <MediaFile media={m} />
      </div>
    );
  }
  const shown = media.slice(0, 4);
  return (
    <div className="grid aspect-square grid-cols-2 gap-0.5 bg-line">
      {shown.map((m, i) => (
        <div key={m.id} className={`relative ${media.length === 3 && i === 0 ? "row-span-2" : ""}`}>
          <MediaFile media={m} />
          {i === 3 && media.length > 4 && (
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-2xl font-semibold text-white">
              +{media.length - 4}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// Instagram: the first file, its shape kept between 4:5 and 1.91:1 (Instagram's limits), dots for the rest.
function InstagramMedia({ media, empty }: { media: PostMedia[]; empty: string }) {
  if (media.length === 0) {
    return (
      <div className="grid aspect-square place-items-center bg-surface text-xs text-muted">
        <span className="px-4 text-center">{empty}</span>
      </div>
    );
  }
  const [first] = media;
  const ratio = Math.min(1.91, Math.max(0.8, first.width / first.height));
  return (
    <div>
      <div className="relative bg-surface" style={{ aspectRatio: String(ratio) }}>
        <MediaFile media={first} />
        {media.length > 1 && (
          <span className="absolute end-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white tabular-nums">
            1/{media.length}
          </span>
        )}
      </div>
      {media.length > 1 && (
        <div className="flex justify-center gap-1 pt-2" aria-hidden>
          {media.map((m, i) => (
            <span key={m.id} className={`size-1.5 rounded-full ${i === 0 ? "bg-brand" : "bg-line"}`} />
          ))}
        </div>
      )}
    </div>
  );
}
