import Link from "next/link";
import type { ComponentProps } from "react";

// One look for every action. primary: the main action of a screen (one per form);
// secondary: the others; danger: delete / remove.
type Variant = "primary" | "secondary" | "danger";

const base =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  secondary: "border border-line bg-card text-ink hover:border-accent",
  danger: "bg-bad text-white hover:opacity-90",
};

export function buttonClass(variant: Variant = "primary", className = "") {
  return `${base} ${variants[variant]} ${className}`.trim();
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  loading?: boolean; // shows a spinner and blocks a second click while a request runs
};

export function Button({ variant = "primary", loading = false, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, className)}
    >
      {loading && (
        <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

// A link that looks like a button (e.g. "Sign up your agency" on the home page).
export function ButtonLink({
  variant = "primary",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...rest} className={buttonClass(variant, className)} />;
}
