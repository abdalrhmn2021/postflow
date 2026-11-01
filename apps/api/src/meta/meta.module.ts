import { Module } from "@nestjs/common";
import { BrandsModule } from "../brands/brands.module.js";
import { MetaController } from "./meta.controller.js";
import { MetaCoreModule } from "./meta-core.module.js";
import { MetaService } from "./meta.service.js";

// Connecting clients' pages: the routes and the login flow (API only - the worker doesn't need them).
@Module({
  imports: [MetaCoreModule, BrandsModule],
  controllers: [MetaController],
  providers: [MetaService],
})
export class MetaModule {}
