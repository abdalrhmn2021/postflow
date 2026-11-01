"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { MediaThumb } from "@/components/MediaThumb";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api, ApiError } from "@/lib/api";
import { errorText, fieldText } from "@/lib/errors";
import { ACCEPT, checkFile, fileRuleProblem, MEDIA_MAX, type MediaKind } from "@/lib/media";
import { sendFile } from "@/lib/upload";
import type { Platform, Post, PostMedia, UploadTicket } from "@/lib/types";

type Props = {
  t: Dictionary["posts"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
  postId: string | undefined; // undefined: a new post, saved on the first upload
  media: PostMedia[];
  platforms: Platform[]; // for the red mark on a file Instagram would refuse
  readOnly: boolean;
  disabled: boolean; // the editor is saving or scheduling
  error?: string; // the API's message about the files (POST_NOT_READY), already translated
  ensurePost: () => Promise<Post>; // the post to upload to - a new one is saved as a draft first
  onPost: (post: Post) => void; // every answer is the whole post: the editor shows it
  onBusy: (busy: boolean) => void; // uploading: the editor holds its save / schedule buttons
};

// A file on its way: uploading to Cloudinary (with %), then being attached by the API.
type Pending = { key: string; name: string; kind: MediaKind; progress: number; attaching: boolean; preview?: string };

// The post's images and videos: drop or pick files, see them upload, put them in order, remove them.
// Each file goes: ticket from our API -> straight to Cloudinary -> attached by our API.
// Files are handled one after another, so they keep the order they were picked in, and two
// attaches never race each other (the API would answer POST_CHANGED to the second).
export function MediaPicker({
  t,
  errors,
  fields,
  postId,
  media,
  platforms,
  readOnly,
  disabled,
  error,
  ensurePost,
  onPost,
  onBusy,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  // The post's id once known. A ref, not state: the files still in the queue need it right away.
  const idRef = useRef(postId);
  useEffect(() => {
    if (postId) idRef.current = postId;
  }, [postId]);

  const [pending, setPending] = useState<Pending[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [working, setWorking] = useState(false); // reordering or removing
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);

  const busy = pending.length > 0 || working;
  useEffect(() => onBusy(busy), [busy, onBusy]);

  const room = MEDIA_MAX - media.length - pending.length;
  const locked = disabled || working;

  function update(key: string, change: Partial<Pending>) {
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...change } : p)));
  }

  // An error from the API or the upload, as one line in this page's language.
  function describe(err: unknown) {
    if (err instanceof ApiError) {
      const field = err.fields.file ?? err.fields.media;
      if (field) return fieldText(field, fields) ?? errorText(err, errors);
    }
    return errorText(err, errors);
  }

  function addFiles(files: FileList | File[]) {
    if (readOnly || locked) return;
    const found: string[] = [];
    const accepted: { file: File; item: Pending }[] = [];

    for (const file of Array.from(files)) {
      const check = checkFile(file);
      if ("problem" in check) {
        found.push(`${file.name}: ${fields[check.problem].replace("{n}", String(check.n))}`);
      } else if (accepted.length >= room) {
        found.push(`${file.name}: ${t.mediaFull}`);
      } else {
        accepted.push({
          file,
          item: {
            key: crypto.randomUUID(),
            name: file.name,
            kind: check.kind,
            progress: 0,
            attaching: false,
            preview: check.kind === "IMAGE" ? URL.createObjectURL(file) : undefined,
          },
        });
      }
    }
    setProblems(found);
    if (accepted.length === 0) return;
    setPending((list) => [...list, ...accepted.map((a) => a.item)]);
    for (const { file, item } of accepted) {
      queue.current = queue.current.then(() => upload(file, item));
    }
  }

  async function upload(file: File, item: Pending) {
    try {
      idRef.current ??= (await ensurePost()).id;
      const id = idRef.current;
      const ticket = await api<UploadTicket>(`/posts/${id}/media/upload`, { method: "POST" });
      const uploaded = await sendFile(ticket, file, (progress) => update(item.key, { progress }));
      update(item.key, { attaching: true, progress: 100 });
      const post = await api<Post>(`/posts/${id}/media`, {
        method: "POST",
        body: { publicId: uploaded.public_id, type: uploaded.resource_type === "video" ? "VIDEO" : "IMAGE" },
      });
      onPost(post);
    } catch (err) {
      setProblems((list) => [...list, `${item.name}: ${describe(err)}`]);
    } finally {
      if (item.preview) URL.revokeObjectURL(item.preview);
      setPending((list) => list.filter((p) => p.key !== item.key));
    }
  }

  async function change(work: () => Promise<Post>) {
    setWorking(true);
    setProblems([]);
    try {
      onPost(await work());
    } catch (err) {
      setProblems([describe(err)]);
    }
    setWorking(false);
  }

  function move(from: number, to: number) {
    if (!postId || from === to || to < 0 || to >= media.length) return;
    const ids = media.map((m) => m.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    void change(() => api<Post>(`/posts/${postId}/media/order`, { method: "PUT", body: { ids } }));
  }

  function remove(m: PostMedia) {
    if (!postId) return;
    void change(() => api<Post>(`/posts/${postId}/media/${m.id}`, { method: "DELETE" }));
  }

  // One drop area for both: files from the computer (add them), or a tile dragged to a new place.
  function onDragOver(e: DragEvent) {
    if (readOnly || locked) return;
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) setDropping(true);
  }
  function onDrop(e: DragEvent, at?: number) {
    e.preventDefault();
    e.stopPropagation();
    setDropping(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    else if (dragIndex !== null && at !== undefined) move(dragIndex, at);
    setDragIndex(null);
  }

  if (readOnly) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t.media}</h3>
        {media.length === 0 ? (
          <p className="text-sm text-muted">{t.mediaNone}</p>
        ) : (
          <ol className="flex flex-wrap gap-2">
            {media.map((m) => (
              <li key={m.id}>
                <MediaThumb media={m} size={96} className="rounded-xl" />
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  }

  return (
    <section
      className="flex flex-col gap-2"
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={(e) => onDrop(e)}
    >
      <h3 className="text-sm font-medium">{t.media}</h3>

      <ol className="flex flex-wrap gap-2" aria-busy={busy || undefined}>
        {media.map((m, i) => {
          const problem = fileRuleProblem(platforms, media, i);
          const n = String(i + 1);
          return (
            <li
              key={m.id}
              draggable={!locked}
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => setDragIndex(null)}
              onDrop={(e) => onDrop(e, i)}
              title={problem ? fields[problem].replace("{n}", n) : t.mediaFile.replace("{n}", n)}
              className={
                "flex w-24 flex-col gap-1 " + (dragIndex === i ? "opacity-40 " : "") + (locked ? "" : "cursor-grab")
              }
            >
              <span className="relative">
                <MediaThumb
                  media={m}
                  size={96}
                  className={"rounded-xl " + (problem ? "ring-2 ring-bad ring-offset-1" : "")}
                />
                <span className="absolute start-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-[11px] font-semibold text-white tabular-nums">
                  {n}
                </span>
                {problem && (
                  <span className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-bad text-xs font-bold text-white">
                    !
                  </span>
                )}
              </span>
              {/* Buttons too, not only dragging: dragging doesn't work on phones, or with a keyboard. */}
              <span className="flex items-center justify-between text-muted">
                <TileButton
                  label={t.mediaEarlier.replace("{n}", n)}
                  disabled={locked || i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <span className="inline-block rtl:rotate-180">‹</span>
                </TileButton>
                <TileButton label={t.mediaRemove.replace("{n}", n)} disabled={locked} onClick={() => remove(m)} danger>
                  ×
                </TileButton>
                <TileButton
                  label={t.mediaLater.replace("{n}", n)}
                  disabled={locked || i === media.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <span className="inline-block rtl:rotate-180">›</span>
                </TileButton>
              </span>
            </li>
          );
        })}

        {pending.map((p) => (
          <li key={p.key} className="flex w-24 flex-col gap-1">
            <span className="relative grid size-24 place-items-center overflow-hidden rounded-xl bg-surface">
              {p.preview ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, not a URL to optimise
                <img src={p.preview} alt="" className="absolute inset-0 size-full object-cover opacity-50" />
              ) : (
                <span aria-hidden className="text-2xl text-muted">
                  ▶
                </span>
              )}
              <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-black/15">
                <span
                  className="block h-full rounded-full bg-brand transition-[width]"
                  style={{ width: `${p.progress}%` }}
                />
              </span>
            </span>
            <span className="truncate text-center text-[11px] text-muted" role="status">
              {p.attaching ? t.mediaAttaching : t.mediaUploading.replace("{n}", String(p.progress))}
            </span>
          </li>
        ))}

        {room > 0 && (
          <li>
            <button
              type="button"
              disabled={locked}
              onClick={() => inputRef.current?.click()}
              className={
                "grid size-24 place-items-center rounded-xl border-2 border-dashed p-2 text-center text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60 " +
                (dropping
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-line text-muted hover:border-brand hover:text-brand")
              }
            >
              <span>
                <span aria-hidden className="block text-2xl leading-none">
                  +
                </span>
                {media.length + pending.length === 0 ? t.mediaDrop : t.mediaDropShort}
              </span>
            </button>
          </li>
        )}
      </ol>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = ""; // picking the same file again still fires onChange
        }}
      />

      <p className="text-xs text-muted">
        {t.mediaHint}
        {!postId && ` ${t.mediaNewPostNote}`}
      </p>
      {error && <p className="text-sm text-bad">{error}</p>}
      {problems.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad"
        >
          <ul className="flex-1">
            {problems.map((p, i) => (
              <li key={i} dir="auto">
                {p}
              </li>
            ))}
          </ul>
          <button type="button" className="text-xs underline" onClick={() => setProblems([])}>
            {t.mediaDismiss}
          </button>
        </div>
      )}
    </section>
  );
}

function TileButton({
  label,
  disabled,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "grid size-7 place-items-center rounded-lg text-base leading-none transition-colors disabled:opacity-30 " +
        (danger ? "hover:bg-bad/10 hover:text-bad" : "hover:bg-surface hover:text-ink")
      }
    >
      {children}
    </button>
  );
}
