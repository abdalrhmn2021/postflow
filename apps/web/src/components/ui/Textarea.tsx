import type { ComponentProps } from "react";

type TextareaProps = ComponentProps<"textarea"> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
};

// A labelled multi-line field, the same look and error/hint line as Input.
export function Textarea({ name, label, error, hint, id = `field-${name}`, className = "", ...rest }: TextareaProps) {
  const noteId = error || hint ? `${id}-note` : undefined;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={noteId}
        className={
          "rounded-xl border bg-card px-3.5 py-2.5 text-base text-ink outline-none transition-colors " +
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
