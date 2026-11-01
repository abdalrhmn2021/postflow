import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { captionPrompt, CaptionWriter, type CaptionIdea, type CaptionRequest } from "./caption-writer.js";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 30_000;

// The part of Gemini's answer we read: the first candidate's text (our JSON).
const responseSchema = z.object({
  candidates: z
    .array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional() }))
    .optional(),
});
const ideasSchema = z.object({
  captions: z.array(z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]) })),
});

const notConfigured = () =>
  new ServiceUnavailableException({
    code: "AI_NOT_CONFIGURED",
    message: "Caption ideas aren't set up on this server (GEMINI_API_KEY in apps/api/.env)",
  });
export const aiFailed = () =>
  new BadGatewayException({ code: "AI_ERROR", message: "The caption writer didn't answer - try again" });

// The model's text -> the ideas. Tolerates a ```json fence around it, which models sometimes add.
export function parseIdeas(text: string): CaptionIdea[] {
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return ideasSchema.parse(JSON.parse(json)).captions;
}

// Google's Gemini through its REST API (no SDK: one call, and nothing to keep up to date).
// JSON mode with a schema, so the answer is data we can check, not prose to pick apart.
@Injectable()
export class GeminiCaptionWriter extends CaptionWriter {
  private readonly logger = new Logger(GeminiCaptionWriter.name);
  private readonly key: string | undefined;
  private readonly model: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.key = config.get("GEMINI_API_KEY", { infer: true });
    this.model = config.get("GEMINI_MODEL", { infer: true });
  }

  get configured() {
    return this.key !== undefined;
  }

  async write(request: CaptionRequest): Promise<CaptionIdea[]> {
    if (!this.key) throw notConfigured();
    const { system, user } = captionPrompt(request);

    let res: Response;
    try {
      res = await fetch(`${API}/${this.model}:generateContent`, {
        method: "POST",
        // The key in a header, not the URL: URLs end up in logs.
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                captions: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: { caption: { type: "STRING" }, hashtags: { type: "ARRAY", items: { type: "STRING" } } },
                    required: ["caption", "hashtags"],
                  },
                },
              },
              required: ["captions"],
            },
          },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Can't reach Gemini: ${(err as Error).message}`);
      throw aiFailed();
    }

    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      // e.g. 400 (bad key / model name), 429 (free quota used up), 503 (busy)
      this.logger.error(`Gemini answered ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      throw aiFailed();
    }
    const text = responseSchema
      .parse(body)
      .candidates?.[0]?.content?.parts.map((p) => p.text ?? "")
      .join("");
    try {
      return parseIdeas(text ?? "");
    } catch {
      // No text (a safety block) or not our JSON.
      this.logger.warn(`Gemini's answer wasn't caption JSON: ${(text ?? "").slice(0, 200)}`);
      throw aiFailed();
    }
  }
}
