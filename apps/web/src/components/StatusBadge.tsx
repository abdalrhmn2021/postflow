import type { PostStatus } from "@/lib/types";

// A post's status as a small coloured label: grey draft, gold scheduled, green published, red failed.
const colors: Record<PostStatus, string> = {
  DRAFT: "bg-line/60 text-muted",
  SCHEDULED: "bg-brand/15 text-brand",
  PUBLISHED: "bg-good/15 text-good",
  FAILED: "bg-bad/15 text-bad",
};

export function StatusBadge({ status, label }: { status: PostStatus; label: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${colors[status]}`}>
      {label}
    </span>
  );
}
