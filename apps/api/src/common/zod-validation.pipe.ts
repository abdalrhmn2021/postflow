import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

// Checks a request body against a zod schema and passes on the cleaned value (trimmed, lower-cased ...).
// A bad body gets a 400 with one message per field, so the form can show each error under its input:
//   { code: "VALIDATION_ERROR", message: "...", fields: { email: "Invalid email address" } }
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;

    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "body";
      fields[field] ??= issue.message; // first problem per field is enough
    }
    throw new BadRequestException({ code: "VALIDATION_ERROR", message: "Some fields are missing or invalid", fields });
  }
}
