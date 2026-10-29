import type { Locale } from "@/i18n/config";

// The time zones offered for a brand, nearest first. The API accepts any real IANA zone; a brand
// with a zone that isn't here (set through the API) still shows it - see timezoneOptions().
const ZONES: { id: string; ar: string; en: string }[] = [
  { id: "Asia/Hebron", ar: "فلسطين - الخليل", en: "Palestine - Hebron" },
  { id: "Asia/Gaza", ar: "فلسطين - غزة", en: "Palestine - Gaza" },
  { id: "Asia/Amman", ar: "الأردن - عمّان", en: "Jordan - Amman" },
  { id: "Africa/Cairo", ar: "مصر - القاهرة", en: "Egypt - Cairo" },
  { id: "Asia/Beirut", ar: "لبنان - بيروت", en: "Lebanon - Beirut" },
  { id: "Asia/Damascus", ar: "سوريا - دمشق", en: "Syria - Damascus" },
  { id: "Asia/Baghdad", ar: "العراق - بغداد", en: "Iraq - Baghdad" },
  { id: "Asia/Riyadh", ar: "السعودية - الرياض", en: "Saudi Arabia - Riyadh" },
  { id: "Asia/Kuwait", ar: "الكويت", en: "Kuwait" },
  { id: "Asia/Qatar", ar: "قطر - الدوحة", en: "Qatar - Doha" },
  { id: "Asia/Dubai", ar: "الإمارات - دبي", en: "UAE - Dubai" },
  { id: "Asia/Muscat", ar: "عُمان - مسقط", en: "Oman - Muscat" },
  { id: "Africa/Tripoli", ar: "ليبيا - طرابلس", en: "Libya - Tripoli" },
  { id: "Africa/Tunis", ar: "تونس", en: "Tunisia - Tunis" },
  { id: "Africa/Algiers", ar: "الجزائر", en: "Algeria - Algiers" },
  { id: "Africa/Casablanca", ar: "المغرب - الدار البيضاء", en: "Morocco - Casablanca" },
  { id: "Europe/Istanbul", ar: "تركيا - إسطنبول", en: "Turkey - Istanbul" },
  { id: "Europe/London", ar: "بريطانيا - لندن", en: "UK - London" },
  { id: "Europe/Berlin", ar: "ألمانيا - برلين", en: "Germany - Berlin" },
  { id: "America/New_York", ar: "أمريكا - نيويورك", en: "USA - New York" },
  { id: "UTC", ar: "التوقيت العالمي (UTC)", en: "UTC" },
];

export const DEFAULT_TIMEZONE = "Asia/Hebron";

// A zone's name in the page's language; an unknown zone shows as its id ("Asia/Tokyo").
export function timezoneName(id: string, locale: Locale): string {
  return ZONES.find((z) => z.id === id)?.[locale] ?? id;
}

// The choices for the brand form, with the brand's current zone included even if it's not in the list.
export function timezoneOptions(locale: Locale, current?: string): { value: string; label: string }[] {
  const options = ZONES.map((z) => ({ value: z.id, label: z[locale] }));
  if (current && !ZONES.some((z) => z.id === current)) options.push({ value: current, label: current });
  return options;
}
