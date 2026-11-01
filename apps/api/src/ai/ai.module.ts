import { Module } from "@nestjs/common";
import { BrandsModule } from "../brands/brands.module.js";
import { AiController } from "./ai.controller.js";
import { AiService } from "./ai.service.js";
import { CaptionWriter } from "./caption-writer.js";
import { GeminiCaptionWriter } from "./gemini.caption-writer.js";

// The e2e tests replace CaptionWriter: builder.overrideProvider(CaptionWriter).useValue(fake).
@Module({
  imports: [BrandsModule],
  controllers: [AiController],
  providers: [{ provide: CaptionWriter, useClass: GeminiCaptionWriter }, AiService],
})
export class AiModule {}
