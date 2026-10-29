import type { ComponentProps } from "react";

type InputProps = ComponentProps<"input"> & {
  name: string;
  label: string;
  error?: string; // shown under the field, in red, and read out by screen readers
  hint?: string; // a short help line under the field when there's no error
};

// A labelled text field. The id comes from the name, so <label> and the error are linked to it.
export function Input({ name, label, error, hint, id = `field-${name}`, className = "", ...rest }: InputProps) {
  const noteId = error || hint ? `${id}-note` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={noteId}
        className={
          "h-11 rounded-xl border bg-card px-3.5 text-base text-ink outline-none transition-colors " +
          "placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20 " +
          (error ? "border-bad" : "border-line")
        }
        {...rest}
      />
      {(error || hint) && (
        <p id={noteId} className={`text-sm ${error ? "text-bad" : "text-muted"}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
