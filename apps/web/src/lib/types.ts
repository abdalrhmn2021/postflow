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
  account: SocialAccount | null; // its Facebook page (+ Instagram), once connected
};

// A client's connected Facebook page and the Instagram linked to it. The token stays on the server.
export type SocialAccount = {
  pageId: string;
  pageName: string;
  pagePicture: string | null;
  instagramId: string | null;
  instagramUsername: string | null;
  instagramPicture: string | null;
  status: "OK" | "NEEDS_RECONNECT";
  checkedAt: string;
  connectedAt: string;
};

// GET /brands/:id/meta/pages/:pick - the pages the owner can choose from after logging in to Facebook.
export type MetaPageChoice = {
  id: string;
  name: string;
  picture: string | null;
  instagram: { id: string; username: string | null; picture: string | null } | null;
  takenBy: string | null; // another client of the agency already has this page
};

// Which platforms a client can be published to. null = Meta isn't set up on the server (not checked).
export type Connected = { facebook: boolean; instagram: boolean } | null;

export function connectedPlatforms(
  account: Pick<SocialAccount, "status" | "instagramId"> | null,
  configured: boolean,
): Connected {
  if (!configured) return null;
  const ok = account?.status === "OK";
  return { facebook: ok, instagram: ok && Boolean(account?.instagramId) };
}

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

export type Platform = "FACEBOOK" | "INSTAGRAM";
// DRAFT -> SCHEDULED -> PUBLISHED, or FAILED when the worker couldn't publish it (phase 4).
export type PostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";

// GET /posts (the calendar range), /posts/unscheduled, /posts/:id. Times are UTC ISO strings;
// show them in brand.timezone (lib/zoned-time.ts), not in the visitor's zone.
export type Post = {
  id: string;
  caption: string;
  platforms: Platform[];
  status: PostStatus;
  scheduledAt: string | null; // a draft may have no time yet
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  brand: {
    id: string;
    name: string;
    timezone: string;
    account: Pick<SocialAccount, "status" | "instagramId"> | null;
  };
  createdBy: { id: string; name: string } | null; // null once that staff member was removed
  media: PostMedia[]; // in order: the first is the cover, more than one is a carousel
};

// One image or video of a post, as the API read it from Cloudinary. url: the original file;
// lib/media.ts makes thumbnails and previews from it.
export type PostMedia = {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  format: string;
  width: number;
  height: number;
  duration: number | null; // seconds, videos only
  publicId: string;
};

// POST /posts/:id/media/upload: send the file to url as multipart form data, with these fields.
export type UploadTicket = { publicId: string; url: string; fields: Record<string, string> };
