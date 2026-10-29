import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { LocalDate } from "@/components/LocalDate";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { getDictionary, getLocale } from "@/i18n/get-dictionary";
import { getSession, serverApi } from "@/lib/server-api";
import type { Invite, Session, StaffMember } from "@/lib/types";
import { InviteActions } from "./InviteActions";
import { InviteForm } from "./InviteForm";
import { MemberActions } from "./MemberActions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).team.title };
}

// The agency's people. Managers see the list; the owner also invites, changes roles and removes.
// Editors don't see the team (the API refuses them), so they're sent to the dashboard.
export default async function TeamPage() {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{dict.team.title}</h1>
        <p className="mt-1 text-muted">{dict.team.subtitle}</p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-line/50" />}>
        <Team locale={locale} dict={dict} />
      </Suspense>
    </div>
  );
}

async function Team({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const session = await getSession();
  if (session.user.role === "EDITOR") redirect(`/${locale}/dashboard`);
  const isOwner = session.user.role === "OWNER";

  const [staff, invites] = await Promise.all([
    serverApi<StaffMember[]>("/staff"),
    isOwner ? serverApi<Invite[]>("/invites").then(markExpired) : Promise.resolve([]),
  ]);
  const t = dict.team;
  const roles = dict.dashboard.roles;

  return (
    <>
      {isOwner && (
        <Section title={t.inviteTitle} hint={t.inviteHint}>
          <InviteForm agencyName={session.agency.name} t={t} roles={roles} errors={dict.errors} fields={dict.fields} />
        </Section>
      )}

      <Section title={t.members} hint={isOwner ? t.roleChangeHint : undefined}>
        <ul className="divide-y divide-line">
          {staff.map((member) => (
            <Member key={member.id} member={member} session={session} locale={locale} dict={dict} />
          ))}
        </ul>
      </Section>

      {isOwner && (
        <Section title={t.pendingTitle}>
          {invites.length === 0 ? (
            <p className="text-sm text-muted">{t.pendingEmpty}</p>
          ) : (
            <ul className="divide-y divide-line">
              {invites.map((invite) => (
                <PendingInvite key={invite.id} invite={invite} session={session} locale={locale} dict={dict} />
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );
}

// The API keeps an expired invite in the list (the owner may send it again); this marks it.
// Done on the data, once per request, not while rendering.
function markExpired(invites: Invite[]): (Invite & { expired: boolean })[] {
  const now = Date.now();
  return invites.map((invite) => ({ ...invite, expired: new Date(invite.expiresAt).getTime() <= now }));
}

function Member({
  member,
  session,
  locale,
  dict,
}: {
  member: StaffMember;
  session: Session;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.team;
  const roles = dict.dashboard.roles;
  const isMe = member.id === session.user.id;
  const sep = locale === "ar" ? "، " : ", ";
  const brands =
    member.role !== "EDITOR"
      ? t.allBrands
      : member.brands.length === 0
        ? t.noBrands
        : t.brandsOf.replace("{list}", member.brands.map((b) => b.name).join(sep));
  // The owner can change everyone but the owner; managers only read.
  const editable = session.user.role === "OWNER" && member.role !== "OWNER";

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          {member.name}
          {isMe && <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">{t.you}</span>}
        </span>
        <span className="text-sm text-muted" dir="ltr">
          {member.email}
        </span>
        <span className="text-sm text-muted">{brands}</span>
      </div>
      {editable ? (
        <MemberActions
          member={{ id: member.id, name: member.name, role: member.role as "MANAGER" | "EDITOR" }}
          t={t}
          roles={roles}
          errors={dict.errors}
        />
      ) : (
        <span className="self-start rounded-full bg-surface px-3 py-1 text-sm">{roles[member.role]}</span>
      )}
    </li>
  );
}

function PendingInvite({
  invite,
  session,
  locale,
  dict,
}: {
  invite: Invite & { expired: boolean };
  session: Session;
  locale: Locale;
  dict: Dictionary;
}) {
  const t = dict.team;
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium" dir="ltr">
          {invite.email}
        </span>
        <span className="text-sm text-muted">
          {dict.dashboard.roles[invite.role]} ·{" "}
          {invite.expired ? (
            <span className="text-bad">{t.expired}</span>
          ) : (
            <>
              {t.expires.split("{date}")[0]}
              <LocalDate value={invite.expiresAt} locale={locale} />
              {t.expires.split("{date}")[1]}
            </>
          )}
        </span>
      </div>
      <InviteActions
        invite={{ id: invite.id, email: invite.email, role: invite.role }}
        agencyName={session.agency.name}
        t={t}
        errors={dict.errors}
      />
    </li>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
