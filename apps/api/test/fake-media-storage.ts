import { MediaType } from "../src/generated/prisma/client.js";
import { MediaStorage, type StoredMedia, type UploadTicket } from "../src/media/media-storage.js";

// Cloudinary, played by a Map - for the e2e tests (no account, no network in CI).
// upload() is what the browser does with a ticket; files/removed let a test look inside.
export class FakeMediaStorage extends MediaStorage {
  readonly configured = true;
  readonly files = new Map<string, StoredMedia>();
  readonly removed: string[] = [];

  uploadTicket(publicId: string): UploadTicket {
    return { url: "https://fake.test/upload", fields: { public_id: publicId, signature: "fake" } };
  }

  // The browser's part: a file arrives under the ticket's name.
  upload(publicId: string, file: Partial<StoredMedia> = {}) {
    const type = file.type ?? MediaType.IMAGE;
    const isImage = type === MediaType.IMAGE;
    this.files.set(publicId, {
      publicId,
      type,
      url: `https://res.fake.test/${publicId}.${isImage ? "jpg" : "mp4"}`,
      format: isImage ? "jpg" : "mp4",
      width: 1080,
      height: isImage ? 1080 : 1920,
      bytes: 500_000,
      duration: isImage ? null : 20,
      ...file,
    });
  }

  find(publicId: string, type: MediaType) {
    const file = this.files.get(publicId);
    return Promise.resolve(file?.type === type ? file : null);
  }

  remove(files: { publicId: string }[]) {
    for (const { publicId } of files) {
      this.files.delete(publicId);
      this.removed.push(publicId);
    }
    return Promise.resolve();
  }

  removePrefix(prefix: string) {
    for (const publicId of this.files.keys()) if (publicId.startsWith(prefix)) this.files.delete(publicId);
    this.removed.push(`${prefix}*`);
    return Promise.resolve();
  }
}
