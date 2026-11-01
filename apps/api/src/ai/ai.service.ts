import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { SessionUser } from "../auth/auth.service.js";
import { BrandsService } from "../brands/brands.service.js";
import { RedisService } from "../redis/redis.service.js";
import type { CaptionsInput } from "./ai.schemas.js";
import { CaptionWriter, finishIdeas } from "./caption-writer.js";
import { aiFailed } from "./gemini.caption-writer.js";

// Per person, per hour. Each request costs a call to Gemini: on the free tier the daily quota is
// shared by the whole agency, so one person clicking "again" can't use it all up.
export const AI_PER_HOUR = 30;

const tooMany = () =>
  new HttpException(
    { code: "AI_LIMIT", message: `At most ${AI_PER_HOUR} caption requests an hour - try again later` },
    HttpStatus.TOO_MANY_REQUESTS,
  );

@Injectable()
export class AiService {
  constructor(
    private readonly writer: CaptionWriter,
    private readonly brands: BrandsService,
    private readonly redis: RedisService,
  ) {}

  get configured() {
    return this.writer.configured;
  }

  // Three caption ideas for a post of this brand, in its language and voice. Nothing is saved:
  // the editor shows them, and the person picks one (or none) into the post.
  async captions(user: SessionUser, { brandId, brief, platforms, current }: CaptionsInput) {
    const brand = await this.brands.get(user, brandId); // 404 if they can't see this client
    await this.countRequest(user.id);
    const ideas = finishIdeas(
      await this.writer.write({
        brief,
        platforms,
        current,
        brand: { name: brand.name, language: brand.language === "en" ? "en" : "ar", voice: brand.voice },
      }),
      platforms,
    );
    if (ideas.length === 0) throw aiFailed();
    return { ideas };
  }

  // A counter per person per clock hour, in Redis: it expires on its own.
  private async countRequest(userId: string) {
    const key = `ai-captions:${userId}:${Math.floor(Date.now() / 3_600_000)}`;
    const count = await this.redis.client.incr(key);
    if (count === 1) await this.redis.client.expire(key, 3600);
    if (count > AI_PER_HOUR) throw tooMany();
  }
}
