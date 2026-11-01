// A page's or an Instagram account's picture, round; the first letter of its name when Meta gave none.
// A plain <img>: the picture is on Meta's servers (fbcdn), small already, and its URL changes over time.
export function AccountAvatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  if (!src) {
    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-full bg-brand font-bold text-on-brand"
        style={{ width: size, height: size }}
      >
        {name.trim().charAt(0) || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      className="shrink-0 rounded-full bg-surface object-cover"
      style={{ width: size, height: size }}
    />
  );
}
