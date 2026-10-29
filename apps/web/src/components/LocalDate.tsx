"use client";

// A date in the visitor's own time zone and language ("5 Nov 2026" / "5 نوفمبر 2026", Latin digits like the rest of the site).
// The server doesn't know the visitor's time zone, so its text may differ by a day from the browser's:
// suppressHydrationWarning lets the browser's version replace it quietly.
export function LocalDate({ value, locale }: { value: string; locale: string }) {
  const text = new Intl.DateTimeFormat(locale === "ar" ? "ar-PS-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
  return (
    <time dateTime={value} suppressHydrationWarning>
      {text}
    </time>
  );
}
