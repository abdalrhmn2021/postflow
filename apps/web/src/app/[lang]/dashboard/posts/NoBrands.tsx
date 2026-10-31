import { ButtonLink } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import type { Role } from "@/lib/types";

// No clients to write for. The owner can fix that himself (a button to add one);
// anyone else waits for the owner to assign them.
export function NoBrands({ role, locale, t }: { role: Role; locale: Locale; t: Dictionary["posts"] }) {
  const isOwner = role === "OWNER";
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-card px-6 py-12 text-center">
      <p className="text-muted">{isOwner ? t.noBrandsOwner : t.noBrands}</p>
      {isOwner && <ButtonLink href={`/${locale}/dashboard/brands/new`}>{t.addBrand}</ButtonLink>}
    </div>
  );
}
