import { updateStaffSchema } from "./staff.schemas.js";

describe("staff schemas", () => {
  it("changes a role to manager or editor only", () => {
    expect(updateStaffSchema.parse({ role: "MANAGER" })).toEqual({ role: "MANAGER" });
    expect(updateStaffSchema.parse({ role: "EDITOR" })).toEqual({ role: "EDITOR" });
    expect(updateStaffSchema.safeParse({ role: "OWNER" }).success).toBe(false);
    expect(updateStaffSchema.safeParse({}).success).toBe(false);
  });
});
