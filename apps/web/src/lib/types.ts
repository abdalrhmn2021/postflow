// Shapes the API answers with (apps/api). Kept by hand for now; they're small.

export type Role = "OWNER" | "MANAGER" | "EDITOR";

// POST /auth/register, POST /auth/login and GET /auth/me all answer with this.
export type Session = {
  user: { id: string; name: string; email: string; role: Role };
  agency: { id: string; name: string; slug: string; plan: string };
};

// GET /brands, /brands/:id. editors: the editors assigned to it (owners and managers see every brand anyway).
export type Brand = {
  id: string;
  name: string;
  language: "ar" | "en"; // the language its posts are written in
  voice: string | null; // how the brand talks, for the AI caption writer (phase 6)
  timezone: string; // IANA, e.g. "Asia/Hebron"
  createdAt: string;
  editors: { id: string; name: string }[];
};

// GET /staff (owner and managers). brands: the brands an editor is on.
export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  brands: { id: string; name: string }[];
};

// GET /invites (owner): open invites. POST /invites answers the same plus the link, once.
export type Invite = {
  id: string;
  email: string;
  role: Exclude<Role, "OWNER">;
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string } | null;
};

export type CreatedInvite = Invite & { link: string };

// GET /invites/accept/:token (public): what the invite page shows before the form.
export type InvitePreview = {
  email: string;
  role: Exclude<Role, "OWNER">;
  agency: { name: string; slug: string };
};
