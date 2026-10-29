import { z } from "zod";
import { Role } from "../generated/prisma/client.js";

// A staff member is a manager or an editor. The owner's role never changes (one owner per agency).
export const updateStaffSchema = z.object({
  role: z.enum([Role.MANAGER, Role.EDITOR], "Must be MANAGER or EDITOR"),
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
