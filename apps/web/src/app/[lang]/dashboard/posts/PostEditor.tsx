"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api } from "@/lib/api";
import { countHashtags, INSTAGRAM_CAPTION_MAX, INSTAGRAM_HASHTAGS_MAX, scheduleProblems } from "@/lib/caption";
import { errorText, fieldErrors } from "@/lib/errors";
import type { Platform, Post, Role } from "@/lib/types";
import { formatInZone, fromZonedInput, toZonedInput } from "@/lib/zoned-time";
import { PostPreview } from "./PostPreview";
import { StatusBadge } from "@/components/StatusBadge";

export type BrandOption = { id: string; name: string; timezone: string; zoneName: string };

type Props = {
  locale: Locale;
  t: Dictionary["posts"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
  role: Role;
  brands: BrandOption[]; // the brands this user can see (the API already filtered them)
  post?: Post; // given: edit it; not given: a new post
  initialBrandId?: string; // a new post from a brand's page or the calendar
  initialWhen?: string; // "2026-11-05T18:30", in that brand's zone (the calendar, step 4)
};

const PLATFORMS: Platform[] = ["FACEBOOK", "INSTAGRAM"];
type Action = "save" | "schedule" | "unschedule" | "delete";

// The browser's own time zone. Only known in the browser: on the server (and in the first render
// in the browser, so the two match) it's null, and the "that's 16:30 your time" line just waits.
const noSubscribe = () => () => {};
function useBrowserZone(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

// Write or change one post. What the buttons do follows the API's rules:
//   anyone on the brand    -> writes and saves drafts, deletes their drafts
//   the owner and managers -> also schedule, unschedule, change a scheduled or failed post
//   a published post       -> read only, for everyone
// A new post becomes a real one on its first save: the URL changes to /posts/<id> without
// reloading the page, so what's typed and any error messages stay on screen.
export function PostEditor({ locale, t, errors, fields, role, brands, post, initialBrandId, initialWhen }: Props) {
  const router = useRouter();
  const browserZone = useBrowserZone();

  const [current, setCurrent] = useState<Post | undefined>(post);
  const [brandId, setBrandId] = useState(post?.brand.id ?? initialBrandId ?? brands[0]?.id ?? "");
  const brand = brands.find((b) => b.id === brandId);
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [platforms, setPlatforms] = useState<Platform[]>(post?.platforms ?? []);
  const [when, setWhen] = useState(
    post?.scheduledAt && brand ? toZonedInput(post.scheduledAt, brand.timezone) : (initialWhen ?? ""),
  );

  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = current?.status ?? "DRAFT";
  const canManage = role !== "EDITOR";
  const readOnly = status === "PUBLISHED" || (!canManage && status !== "DRAFT");
  const scheduledAt = when && brand ? fromZonedInput(when, brand.timezone) : null;
  // "That's 20:30 your time" - only when the visitor's clock differs from the client's
  // (not for Gaza vs Hebron: different zone names, same hour).
  const yourTime =
    scheduledAt &&
    brand &&
    browserZone &&
    formatInZone(scheduledAt, browserZone, locale) !== formatInZone(scheduledAt, brand.timezone, locale)
      ? formatInZone(scheduledAt, browserZone, locale)
      : null;

  // The counters follow Instagram's limits only when Instagram is picked (Facebook allows far more).
  const onInstagram = platforms.includes("INSTAGRAM");
  const tags = countHashtags(caption);
  const tooLong = onInstagram && caption.length > INSTAGRAM_CAPTION_MAX;
  const tooManyTags = onInstagram && tags > INSTAGRAM_HASHTAGS_MAX;

  // A change clears the "saved" note and the error under the field that changed - it may be fixed now.
  function edited(field?: string) {
    setNotice(null);
    if (field) {
      setFieldError((old) => {
        const rest = { ...old };
        delete rest[field];
        return rest;
      });
    }
  }

  function togglePlatform(p: Platform) {
    edited("platforms");
    setPlatforms((list) =>
      list.includes(p) ? list.filter((x) => x !== p) : PLATFORMS.filter((x) => x === p || list.includes(x)),
    );
  }

  // Saves what's on screen: POST for a new post, PATCH for an existing one. Returns the saved post.
  async function save(): Promise<Post> {
    const body = { caption, platforms, scheduledAt };
    if (current) {
      return api<Post>(`/posts/${current.id}`, { method: "PATCH", body });
    }
    const created = await api<Post>("/posts", { method: "POST", body: { ...body, brandId } });
    // The page now shows this post: /posts/<id>, without a reload (Next.js keeps it in sync).
    window.history.replaceState(null, "", `/${locale}/dashboard/posts/${created.id}`);
    return created;
  }

  async function run(action: Action, work: () => Promise<Post | void>, done?: string) {
    setBusy(action);
    setNotice(null);
    setFormError(null);
    setFieldError({});
    try {
      const result = await work();
      if (result) setCurrent(result);
      if (done) setNotice(done);
    } catch (err) {
      setFormError(errorText(err, errors));
      setFieldError(fieldErrors(err, fields));
    }
    setBusy(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("save", save, t.saved);
  }

  // Save first (so what's on screen is what gets scheduled), then schedule.
  // If scheduling is refused (POST_NOT_READY), the post stays saved as a draft and the reasons
  // show under the fields.
  function schedule() {
    const problems = scheduleProblems({ caption, platforms, scheduledAt });
    if (Object.keys(problems).length > 0) {
      setNotice(null);
      setFormError(errors.POST_NOT_READY);
      setFieldError(
        Object.fromEntries(
          Object.entries(problems).map(([field, key]) => [
            field,
            fields[key].replace(
              "{n}",
              key === "instagramChars" ? String(INSTAGRAM_CAPTION_MAX) : String(INSTAGRAM_HASHTAGS_MAX),
            ),
          ]),
        ),
      );
      return;
    }
    void run(
      "schedule",
      async () => {
        const saved = await save();
        setCurrent(saved);
        return api<Post>(`/posts/${saved.id}/schedule`, { method: "POST" });
      },
      t.scheduledOk,
    );
  }

  function unschedule() {
    if (!current) return;
    void run("unschedule", () => api<Post>(`/posts/${current.id}/unschedule`, { method: "POST" }), t.unscheduledOk);
  }

  async function remove() {
    if (!current) return;
    setBusy("delete");
    setFormError(null);
    try {
      await api(`/posts/${current.id}`, { method: "DELETE" });
      router.replace(`/${locale}/dashboard/posts`);
      router.refresh();
    } catch (err) {
      setFormError(errorText(err, errors));
      setBusy(null);
    }
  }

  const lockedText =
    status === "PUBLISHED" ? t.lockedPublished : status === "FAILED" ? t.lockedFailed : t.lockedScheduled;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{current ? t.editTitle : t.newTitle}</h1>
        {current && <StatusBadge status={status} label={t.status[status]} />}
      </div>

      {readOnly && <p className="rounded-xl border border-line bg-card px-4 py-3 text-sm text-muted">{lockedText}</p>}
      {!readOnly && status === "FAILED" && (
        <p className="rounded-xl border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-bad">{t.failedHint}</p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-6">
          <FormError message={formError} />

          <Select
            name="brandId"
            label={t.brand}
            value={brandId}
            onChange={(e) => {
              edited("brandId");
              setBrandId(e.target.value);
            }}
            options={brands.map((b) => ({ value: b.id, label: b.name }))}
            disabled={Boolean(current) || readOnly}
            hint={current && !readOnly ? t.brandFixed : undefined}
            error={fieldError.brandId}
          />

          <div className="flex flex-col gap-1.5">
            <Textarea
              name="caption"
              label={t.caption}
              placeholder={t.captionPlaceholder}
              value={caption}
              onChange={(e) => {
                edited("caption");
                setCaption(e.target.value);
              }}
              rows={8}
              dir="auto"
              readOnly={readOnly}
              error={fieldError.caption}
            />
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-live="polite">
              <span className={tooLong ? "font-semibold text-bad" : undefined}>
                {(onInstagram ? t.charsOf : t.chars)
                  .replace("{n}", String(caption.length))
                  .replace("{max}", String(INSTAGRAM_CAPTION_MAX))}
              </span>
              <span className={tooManyTags ? "font-semibold text-bad" : undefined}>
                {(onInstagram ? t.hashtagsOf : t.hashtags)
                  .replace("{n}", String(tags))
                  .replace("{max}", String(INSTAGRAM_HASHTAGS_MAX))}
              </span>
              {(tooLong || tooManyTags) && <span className="text-bad">{t.instagramLimits}</span>}
            </p>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t.platforms}</legend>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const on = platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    disabled={readOnly}
                    onClick={() => togglePlatform(p)}
                    className={
                      "h-10 rounded-xl border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed " +
                      (on
                        ? "border-brand bg-brand text-on-brand"
                        : "border-line bg-card text-ink hover:border-accent disabled:opacity-60")
                    }
                  >
                    {on ? "✓ " : ""}
                    {t.platformNames[p]}
                  </button>
                );
              })}
            </div>
            {fieldError.platforms && <p className="text-sm text-bad">{fieldError.platforms}</p>}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Input
              name="scheduledAt"
              type="datetime-local"
              label={t.when}
              value={when}
              onChange={(e) => {
                edited("scheduledAt");
                setWhen(e.target.value);
              }}
              readOnly={readOnly}
              error={fieldError.scheduledAt}
              hint={brand ? t.whenHint.replace("{zone}", brand.zoneName) : undefined}
              className="max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              {yourTime && <span>{t.whenYours.replace("{time}", yourTime)}</span>}
              {when && !readOnly && (
                <button
                  type="button"
                  className="underline hover:text-ink"
                  onClick={() => {
                    edited("scheduledAt");
                    setWhen("");
                  }}
                >
                  {t.clearTime}
                </button>
              )}
            </div>
          </div>

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
              {status === "SCHEDULED" ? (
                <>
                  <Button type="submit" loading={busy === "save"} disabled={busy !== null}>
                    {t.save}
                  </Button>
                  <Button
                    variant="secondary"
                    loading={busy === "unschedule"}
                    disabled={busy !== null}
                    onClick={unschedule}
                  >
                    {t.unschedule}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="submit"
                    variant={canManage ? "secondary" : "primary"}
                    loading={busy === "save"}
                    disabled={busy !== null || !brand}
                  >
                    {t.saveDraft}
                  </Button>
                  {canManage ? (
                    <Button loading={busy === "schedule"} disabled={busy !== null || !brand} onClick={schedule}>
                      {t.schedule}
                    </Button>
                  ) : (
                    <span className="text-sm text-muted">{t.editorScheduleHint}</span>
                  )}
                </>
              )}
              {notice && (
                <p role="status" className="text-sm text-good">
                  {notice}
                </p>
              )}
            </div>
          )}
        </form>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
          <h2 className="text-sm font-semibold text-muted">{t.preview}</h2>
          <PostPreview
            locale={locale}
            t={t}
            brandName={brand?.name ?? ""}
            timezone={brand?.timezone ?? "UTC"}
            caption={caption}
            platforms={platforms}
            scheduledAt={scheduledAt}
          />
        </aside>
      </div>

      {current && !readOnly && (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-6">
          {!confirmDelete ? (
            <Button
              variant="danger"
              className="self-start"
              onClick={() => setConfirmDelete(true)}
              disabled={busy !== null}
            >
              {t.delete}
            </Button>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-bad/30 bg-bad/5 p-4">
              <p className="font-medium">{t.deleteConfirm}</p>
              <div className="flex gap-3">
                <Button variant="danger" loading={busy === "delete"} onClick={remove}>
                  {t.deleteYes}
                </Button>
                <Button variant="secondary" disabled={busy === "delete"} onClick={() => setConfirmDelete(false)}>
                  {t.cancel}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
