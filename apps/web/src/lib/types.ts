// Shapes the API answers with (apps/api). Kept by hand for now; they're small.

export type Role = "OWNER" | "MANAGER" | "EDITOR";

// POST /auth/register, POST /auth/login and GET /auth/me all answer with this.
export type Session = {
  user: { id: string; name: string; email: string; role: Role };
  agency: { id: string; name: string; slug: string; plan: string };
};
