"use client";

import { useRouter } from "next/navigation";

type Props = {
  label: string;
  allLabel: string;
  brands: { id: string; name: string }[];
  value: string; // "" = all clients
  hrefFor: Record<string, string>; // brand id ("" for all) -> the calendar URL with that filter
};

// Show one client's posts or everyone's. The URL holds the choice (?brand=<id>), so the page
// re-renders on the server with only that client's posts, and the link can be shared.
export function BrandFilter({ label, allLabel, brands, value, hrefFor }: Props) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => router.push(hrefFor[e.target.value] ?? hrefFor[""])}
        className="h-10 rounded-xl border border-line bg-card px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        <option value="">{allLabel}</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}
