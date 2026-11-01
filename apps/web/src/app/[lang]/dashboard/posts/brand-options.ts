import "server-only";
import type { Locale } from "@/i18n/config";
import { serverApi } from "@/lib/server-api";
import { timezoneName } from "@/lib/timezones";
import { connectedPlatforms, type Brand } from "@/lib/types";
import type { BrandOption } from "./PostEditor";

// The brands the logged-in user can write for (the API filters them by role), with each zone's
// name in the page's language and the platforms it's connected to - what the editor needs, nothing more.
export async function brandOptions(locale: Locale): Promise<BrandOption[]> {
  const [brands, meta] = await Promise.all([
    serverApi<Brand[]>("/brands"),
    serverApi<{ configured: boolean }>("/meta"),
  ]);
  return brands.map(({ id, name, timezone, account, requiresApproval }) => ({
    id,
    name,
    timezone,
    requiresApproval,
    zoneName: timezoneName(timezone, locale),
    connected: connectedPlatforms(account, meta.configured),
  }));
}
