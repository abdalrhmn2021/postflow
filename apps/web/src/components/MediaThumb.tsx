import { formatDuration, thumbUrl } from "@/lib/media";
import type { PostMedia } from "@/lib/types";

// A post file as a small square: the image, or a video's first frame with ▶ and its length.
// A plain <img>: Cloudinary already sends a small, compressed copy (thumbUrl), so next/image would
// only fetch and resize it a second time.
export function MediaThumb({
  media,
  size,
  className = "",
}: {
  media: Pick<PostMedia, "type" | "url" | "duration">;
  size: number; // CSS pixels; Cloudinary is asked for twice that, for sharp phone screens
  className?: string;
}) {
  return (
    <span className={`relative block overflow-hidden bg-surface ${className}`} style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
      <img
        src={thumbUrl(media, size * 2)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        className="size-full object-cover"
      />
      {media.type === "VIDEO" && (
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/55 px-1 text-[10px] leading-4 text-white">
          <span aria-hidden>▶</span>
          {media.duration !== null && <span className="tabular-nums">{formatDuration(media.duration)}</span>}
        </span>
      )}
    </span>
  );
}
