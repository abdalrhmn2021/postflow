import { z } from "zod";

// POST /review/:token/posts/:postId - the client's answer. Asking for changes needs a word on what.
export const answerSchema = z
  .object({
    decision: z.enum(["APPROVE", "CHANGES"], "Must be APPROVE or CHANGES"),
    note: z.string().trim().max(1000, "At most 1000 characters").optional(),
  })
  .refine((a) => a.decision === "APPROVE" || Boolean(a.note), {
    message: "Tell the agency what to change",
    path: ["note"],
  });

export type AnswerInput = z.infer<typeof answerSchema>;
