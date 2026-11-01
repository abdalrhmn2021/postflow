import { createHash } from "node:crypto";
import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { MediaType } from "../generated/prisma/client.js";
import type { CloudinaryConfig, Env } from "../config/env.js";
import { IMAGE_FORMATS, VIDEO_FORMATS } from "./media.rules.js";
import { MediaStorage, type StoredMedia, type UploadTicket } from "./media-storage.js";

const API = "https://api.cloudinary.com/v1_1";
const TIMEOUT_MS = 15_000;

// Cloudinary's request signature: the parameters sorted by name, joined as a=1&b=2, the API secret
// appended, SHA-1 in hex. Cloudinary computes the same and refuses the request if they differ -
// so the browser can't change the file's name or allowed formats without the secret.
// (file, cloud_name, resource_type and api_key are never signed.)
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");
}

// The part of Cloudinary's "resource details" answer we use. More fields come; they are ignored.
const resourceSchema = z.object({
  public_id: z.string(),
  format: z.string(),
  bytes: z.number(),
  width: z.number(),
  height: z.number(),
  secure_url: z.string(),
  duration: z.number().optional(), // videos
});

const resourceType = (type: MediaType) => (type === MediaType.VIDEO ? "video" : "image");

const notConfigured = () =>
  new ServiceUnavailableException({
    code: "MEDIA_NOT_CONFIGURED",
    message: "Uploads aren't set up on this server (CLOUDINARY_URL in apps/api/.env)",
  });
const storageDown = () =>
  new BadGatewayException({ code: "MEDIA_STORAGE_ERROR", message: "Couldn't reach the file storage - try again" });

@Injectable()
export class CloudinaryStorage extends MediaStorage {
  private readonly logger = new Logger(CloudinaryStorage.name);
  private readonly config: CloudinaryConfig | undefined;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.config = config.get("CLOUDINARY_URL", { infer: true });
  }

  get configured() {
    return this.config !== undefined;
  }

  uploadTicket(publicId: string): UploadTicket {
    const { cloudName, apiKey, apiSecret } = this.need();
    const signed = {
      public_id: publicId,
      allowed_formats: [...IMAGE_FORMATS, ...VIDEO_FORMATS].join(","),
      timestamp: Math.floor(Date.now() / 1000), // Cloudinary refuses a signature older than an hour
    };
    return {
      url: `${API}/${cloudName}/auto/upload`, // "auto": Cloudinary decides image or video from the file
      fields: {
        ...signed,
        timestamp: String(signed.timestamp),
        api_key: apiKey,
        signature: signParams(signed, apiSecret),
      },
    };
  }

  async find(publicId: string, type: MediaType): Promise<StoredMedia | null> {
    const { cloudName } = this.need();
    const name = publicId.split("/").map(encodeURIComponent).join("/");
    const res = await this.call(`${API}/${cloudName}/resources/${resourceType(type)}/upload/${name}`);
    if (res.status === 404) return null;
    if (!res.ok) throw await this.failed("find", res);

    const parsed = resourceSchema.safeParse(await res.json());
    if (!parsed.success) {
      this.logger.error(`Unexpected answer from Cloudinary for ${publicId}: ${parsed.error.message}`);
      throw storageDown();
    }
    const r = parsed.data;
    return {
      publicId: r.public_id,
      type,
      url: r.secure_url,
      format: r.format,
      width: r.width,
      height: r.height,
      bytes: r.bytes,
      duration: r.duration ?? null,
    };
  }

  async remove(files: { publicId: string; type: MediaType }[]) {
    if (!this.config || files.length === 0) return;
    const { cloudName, apiKey, apiSecret } = this.config;
    await Promise.all(
      files.map(async ({ publicId, type }) => {
        const signed = { public_id: publicId, invalidate: "true", timestamp: Math.floor(Date.now() / 1000) };
        const body = new URLSearchParams({
          ...signed,
          timestamp: String(signed.timestamp),
          api_key: apiKey,
          signature: signParams(signed, apiSecret),
        });
        try {
          const res = await this.call(`${API}/${cloudName}/${resourceType(type)}/destroy`, { method: "POST", body });
          if (!res.ok) await this.failed("remove", res);
        } catch (err) {
          this.logger.warn(`Couldn't delete ${publicId} from Cloudinary: ${(err as Error).message}`);
        }
      }),
    );
  }

  async removePrefix(prefix: string) {
    if (!this.config) return;
    const { cloudName } = this.config;
    await Promise.all(
      [MediaType.IMAGE, MediaType.VIDEO].map(async (type) => {
        const url = `${API}/${cloudName}/resources/${resourceType(type)}/upload?prefix=${encodeURIComponent(prefix)}`;
        try {
          const res = await this.call(url, { method: "DELETE" });
          if (!res.ok) await this.failed("removePrefix", res);
        } catch (err) {
          this.logger.warn(`Couldn't delete ${prefix}* from Cloudinary: ${(err as Error).message}`);
        }
      }),
    );
  }

  private need(): CloudinaryConfig {
    if (!this.config) throw notConfigured();
    return this.config;
  }

  // The Admin API takes the key and secret as Basic auth; the upload API (destroy) takes a signature.
  private async call(url: string, init: RequestInit = {}) {
    const { apiKey, apiSecret } = this.need();
    try {
      return await fetch(url, {
        ...init,
        headers: { Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Can't reach Cloudinary (${url.split("?")[0]}): ${(err as Error).message}`);
      throw storageDown();
    }
  }

  // Logs Cloudinary's own reason ({ error: { message } }) and returns the error to throw.
  private async failed(action: string, res: Response) {
    const text = await res.text().catch(() => "");
    this.logger.error(`Cloudinary ${action} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    return storageDown();
  }
}
