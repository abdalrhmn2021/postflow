import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { buttonClass } from "@/components/ui/Button";
import { LocalDate } from "@/components/LocalDate";
import type { Brand, Role } from "@/lib/types";
import { AccountActions } from "./AccountActions";
import { AccountAvatar } from "./AccountAvatar";
import { PagePicker } from "./PagePicker";

// After Facebook's login the API sends the browser back here with one of these in the URL.
export type ConnectReturn = { pick?: string; error?: string; done?: boolean };

type Props = {
  locale: Locale;
  dict: Dictionary;
  brand: Brand;
  role: Role;
  configured: boolean; // GET /api/meta: are META_APP_ID / META_APP_SECRET set on the server?
  back: ConnectReturn;
};

// The client's Facebook page and Instagram: connected or not, and the buttons for it.
//   owner   -> connect / pick a page / connect again / check / disconnect
//   manager -> sees it, can check it
//   editor  -> sees it
export function AccountSection({ locale, dict, brand, role, configured, back }: Props) {
  const t = dict.accounts;
  const isOwner = role === "OWNER";
  const account = brand.account;

  // "Connect" opens /api/... in the browser itself (not api()): the API answers with a redirect to Facebook.
  const connectHref = `/api/brands/${brand.id}/meta/connect?lang=${locale}`;
  const connectLink = (label: string, variant: "primary" | "secondary" = "primary") => (
    <a href={connectHref} className={buttonClass(variant, "self-start")}>
      {label}
    </a>
  );

  const errorKey = {
    denied: t.errorDenied,
    expired: t.errorExpired,
    no_pages: t.errorNoPages,
    failed: t.errorFailed,
  }[back.error ?? ""];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-6">
      <div>
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.hint}</p>
      </div>

      {errorKey && (
        <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
          {errorKey}
        </p>
      )}
      {back.done && (
        <p role="status" className="text-sm text-good">
          {t.connected}
        </p>
      )}

      {!configured ? (
        <p className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm text-muted">{t.notConfigured}</p>
      ) : isOwner && back.pick ? (
        <PagePicker locale={locale} brandId={brand.id} pick={back.pick} t={t} errors={dict.errors} />
      ) : account ? (
        <>
          {account.status === "NEEDS_RECONNECT" && (
            <p className="rounded-xl border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">{t.reconnectHint}</p>
          )}
          <ul className="flex flex-col gap-3">
            <Row
              avatar={<AccountAvatar src={account.pagePicture} name={account.pageName} />}
              platform={t.facebook}
              name={account.pageName}
              status={account.status === "OK" ? t.statusOk : t.statusReconnect}
              ok={account.status === "OK"}
            />
            {account.instagramId ? (
              <Row
                avatar={
                  <AccountAvatar src={account.instagramPicture} name={account.instagramUsername ?? account.pageName} />
                }
                platform={t.instagram}
                name={`@${account.instagramUsername ?? account.instagramId}`}
                status={account.status === "OK" ? t.statusOk : t.statusReconnect}
                ok={account.status === "OK"}
              />
            ) : (
              <li className="rounded-xl border border-dashed border-line p-3 text-sm">
                <p className="font-medium">{t.noInstagram}</p>
                <p className="mt-1 text-muted">{t.noInstagramHint}</p>
              </li>
            )}
          </ul>
          <p className="text-xs text-muted">
            {t.checkedAt.split("{time}")[0]}
            <LocalDate value={account.checkedAt} locale={locale} />
          </p>
          {isOwner &&
            connectLink(
              account.status === "OK" ? t.changePage : t.reconnect,
              account.status === "OK" ? "secondary" : "primary",
            )}
          {role !== "EDITOR" && (
            <AccountActions brandId={brand.id} canDisconnect={isOwner} t={t} errors={dict.errors} />
          )}
        </>
      ) : isOwner ? (
        <>
          <p className="text-sm">{t.notConnected}</p>
          {connectLink(t.connect)}
          <p className="text-xs text-muted">{t.connectHint}</p>
        </>
      ) : (
        <p className="text-sm text-muted">{t.notConnectedOther}</p>
      )}
    </section>
  );
}

function Row({
  avatar,
  platform,
  name,
  status,
  ok,
}: {
  avatar: ReactNode;
  platform: string;
  name: string;
  status: string;
  ok: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line p-3">
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs text-muted">{platform}</span>
        <span dir="auto" className="truncate font-medium">
          {name}
        </span>
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-good/15 text-good" : "bg-bad/15 text-bad"}`}
      >
        {status}
      </span>
    </li>
  );
}
