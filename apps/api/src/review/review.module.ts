import { Module } from "@nestjs/common";
import { BrandsModule } from "../brands/brands.module.js";
import { ReviewController } from "./review.controller.js";
import { ReviewService } from "./review.service.js";

@Module({
  imports: [BrandsModule],
  controllers: [ReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
