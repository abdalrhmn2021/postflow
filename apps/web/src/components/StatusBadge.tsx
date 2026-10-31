import type { PostStatus } from "@/lib/types";

// A post's status as a small coloured label: grey draft, gold scheduled, green published, red failed.
export const statusColors: Record<PostStatus, string> = {
  DRAFT: "bg-line/60 text-muted",
  SCHEDULED: "bg-brand/15 text-brand",
  PUBLISHED: "bg-good/15 text-good",
  FAILED: "bg-bad/15 text-bad",
};

// The same colours as a thin mark at the start of a calendar entry.
export const statusMarks: Record<PostStatus, string> = {
  DRAFT: "border-muted/50",
  SCHEDULED: "border-brand",
  PUBLISHED: "border-good",
  FAILED: "border-bad",
};

// And as a small dot (the month view's entries).
export const statusDots: Record<PostStatus, string> = {
  DRAFT: "bg-muted/60",
  SCHEDULED: "bg-brand",
  PUBLISHED: "bg-good",
  FAILED: "bg-bad",
};

export function StatusBadge({ status, label }: { status: PostStatus; label: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${statusColors[status]}`}
    >
      {label}
    </span>
  );
}
