import { hashInviteToken, inviteLink, newInviteToken } from "./invite-token.js";
import { acceptInviteSchema, createInviteSchema } from "./invites.schemas.js";

describe("invite schemas", () => {
  it("stores the email lower-case", () => {
    expect(createInviteSchema.parse({ email: " Ali@Mail.COM ", role: "EDITOR" })).toEqual({
      email: "ali@mail.com",
      role: "EDITOR",
    });
  });

  it("invites a manager or an editor, never an owner", () => {
    expect(createInviteSchema.safeParse({ email: "a@b.co", role: "MANAGER" }).success).toBe(true);
    expect(createInviteSchema.safeParse({ email: "a@b.co", role: "OWNER" }).success).toBe(false);
    expect(createInviteSchema.safeParse({ email: "a@b.co" }).success).toBe(false);
  });

  it("asks for a name and a password of 8 or more characters when accepting", () => {
    const token = newInviteToken();
    expect(acceptInviteSchema.safeParse({ token, name: "سارة", password: "a-long-password" }).success).toBe(true);
    expect(acceptInviteSchema.safeParse({ token, name: "سارة", password: "short" }).success).toBe(false);
    expect(acceptInviteSchema.safeParse({ token: "x", name: "سارة", password: "a-long-password" }).success).toBe(false);
  });
});

describe("invite tokens", () => {
  it("makes a new 43-character secret every time", () => {
    const a = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newInviteToken()).not.toBe(a);
  });

  it("stores a hash that is the same for the same secret and is not the secret", () => {
    const token = newInviteToken();
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
    expect(hashInviteToken(token)).not.toContain(token);
    expect(hashInviteToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("builds the link on the first website address", () => {
    expect(inviteLink("http://localhost:3000", "abc")).toBe("http://localhost:3000/invite/abc");
    expect(inviteLink("https://postflow.app/, http://localhost:3000", "abc")).toBe("https://postflow.app/invite/abc");
  });
});
