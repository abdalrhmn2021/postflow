import Link from "next/link";

// The PostFlow name as a logo, linking to the front page in the current language.
export function Logo({ locale }: { locale: string }) {
  return (
    <Link href={`/${locale}`} className="text-lg font-bold" dir="ltr">
      Post<span className="text-accent">Flow</span>
    </Link>
  );
}
