import type { Dictionary } from "@/i18n/dictionaries/ar";
import { ApiError } from "./api";

// Turns API errors into text in the page's language. Safe in Client Components:
// they get dict.errors / dict.fields as props from the page.

// The message above a form, for any thrown error.
export function errorText(err: unknown, errors: Dictionary["errors"]): string {
  const code = err instanceof ApiError ? err.code : "UNKNOWN";
  return (errors as Record<string, string>)[code] ?? errors.UNKNOWN;
}

// The API's message under one field (apps/api zod schemas) -> the same meaning in this language.
// An unknown message (zod's own, e.g. "Invalid input: expected string") gets a general one.
const PATTERNS: [RegExp, keyof Dictionary["fields"]][] = [
  [/^Required$/, "required"],
  [/^At least (\d+) characters$/, "atLeast"],
  [/^At most (\d+) characters$/, "atMost"],
  [/^Invalid email address$/, "invalidEmail"],
  [/^Only English letters, numbers and dashes$/, "slugChars"],
  [/^Must be ar or en$/, "language"],
  [/^Unknown time zone$/, "timezone"],
  [/^Nothing to change$/, "nothingToChange"],
  [/^Must be MANAGER or EDITOR$/, "role"],
];

export function fieldText(apiMessage: string | undefined, fields: Dictionary["fields"]): string | undefined {
  if (!apiMessage) return undefined;
  for (const [pattern, key] of PATTERNS) {
    const match = pattern.exec(apiMessage);
    if (match) return fields[key].replace("{n}", match[1] ?? "");
  }
  return fields.invalid;
}

// All of one error's field messages, translated: { email: "الإيميل مش صحيح", ... }
export function fieldErrors(err: unknown, fields: Dictionary["fields"]): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  return Object.fromEntries(Object.entries(err.fields).map(([name, msg]) => [name, fieldText(msg, fields) ?? ""]));
}
