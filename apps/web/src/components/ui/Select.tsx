import type { ComponentProps } from "react";

type SelectProps = ComponentProps<"select"> & {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  error?: string;
  hint?: string;
};

// A labelled drop-down, the same look and error/hint line as Input.
export function Select({
  name,
  label,
  options,
  error,
  hint,
  id = `field-${name}`,
  className = "",
  ...rest
}: SelectProps) {
  const noteId = error || hint ? `${id}-note` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={noteId}
        className={
          "h-11 rounded-xl border bg-card px-3 text-base text-ink outline-none transition-colors " +
          "focus:border-brand focus:ring-2 focus:ring-brand/20 " +
          (error ? "border-bad" : "border-line")
        }
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {(error || hint) && (
        <p id={noteId} className={`text-sm ${error ? "text-bad" : "text-muted"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
