// The message above a form when a request fails (from errorText()). Nothing when there's no error.
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">
      {message}
    </p>
  );
}
