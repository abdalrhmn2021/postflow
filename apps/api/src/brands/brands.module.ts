import { Module } from "@nestjs/common";
import { BrandsController } from "./brands.controller.js";
import { BrandsService } from "./brands.service.js";

@Module({
  controllers: [BrandsController],
  providers: [BrandsService],
  exports: [BrandsService], // posts (phase 2) check a brand is visible before using it
})
export class BrandsModule {}
