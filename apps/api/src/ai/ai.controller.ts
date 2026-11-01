import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import type { SessionUser } from "../auth/auth.service.js";
import { CurrentUser } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { captionsSchema, type CaptionsInput } from "./ai.schemas.js";
import { AiService } from "./ai.service.js";

// Caption ideas, for anyone who can write posts for the client (editors too).
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  // GET /api/ai -> { configured } - the editor shows the button only when it can work
  @Get()
  status() {
    return { configured: this.ai.configured };
  }

  // POST /api/ai/captions { brandId, brief, platforms?, current? } -> { ideas: [3 captions] }
  //   | 404 BRAND_NOT_FOUND | 429 AI_LIMIT | 502 AI_ERROR | 503 AI_NOT_CONFIGURED
  @Post("captions")
  @HttpCode(200)
  captions(@CurrentUser() user: SessionUser, @Body(new ZodValidationPipe(captionsSchema)) body: CaptionsInput) {
    return this.ai.captions(user, body);
  }
}
