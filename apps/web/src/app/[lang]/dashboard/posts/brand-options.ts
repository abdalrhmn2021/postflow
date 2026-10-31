import "server-only";
import type { Locale } from "@/i18n/config";
import { serverApi } from "@/lib/server-api";
import { timezoneName } from "@/lib/timezones";
import type { Brand } from "@/lib/types";
import type { BrandOption } from "./PostEditor";

// The brands the logged-in user can write for (the API filters them by role), with each zone's
// name in the page's language - what the editor's brand list and time hint need, nothing more.
export async function brandOptions(locale: Locale): Promise<BrandOption[]> {
  const brands = await serverApi<Brand[]>("/brands");
  return brands.map(({ id, name, timezone }) => ({ id, name, timezone, zoneName: timezoneName(timezone, locale) }));
}
