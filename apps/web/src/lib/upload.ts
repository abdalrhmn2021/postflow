import { ApiError } from "./api";
import type { UploadTicket } from "./types";

// What Cloudinary answers after an upload (the part we use).
export type Uploaded = { public_id: string; resource_type: "image" | "video" | string };

// Sends one file straight to Cloudinary with a ticket from POST /posts/:id/media/upload.
// XMLHttpRequest, not fetch: only it reports upload progress (fetch can't, yet), for the % on the tile.
// The file never passes through our own server, so a 100 MB video doesn't tie it up.
export function sendFile(ticket: UploadTicket, file: File, onProgress: (percent: number) => void): Promise<Uploaded> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
    form.append("file", file); // last: Cloudinary reads the signed fields first

    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const body = xhr.response as Partial<Uploaded> | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.public_id) resolve(body as Uploaded);
      else reject(new ApiError(xhr.status, "UPLOAD_FAILED")); // Cloudinary's reason is in body.error.message
    };
    xhr.onerror = () => reject(new ApiError(0, "UPLOAD_FAILED"));
    xhr.send(form);
  });
}
