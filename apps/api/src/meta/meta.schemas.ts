import { z } from "zod";

// PUT /brands/:id/meta - the page chosen from the list the login brought back.
export const connectPageSchema = z.object({
  pick: z.string().min(1, "Required").max(100),
  pageId: z.string().min(1, "Required").max(100),
});

// GET /meta/callback - what Facebook adds to the URL when it sends the browser back.
export const callbackQuerySchema = z.object({
  state: z.string().max(200).optional(),
  code: z.string().max(2000).optional(),
  error: z.string().max(200).optional(), // "access_denied" when the person pressed Cancel
});

export type ConnectPageInput = z.infer<typeof connectPageSchema>;
export type CallbackQuery = z.infer<typeof callbackQuerySchema>;
