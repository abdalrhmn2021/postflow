import { Global, Module } from "@nestjs/common";
import { BrandsModule } from "../brands/brands.module.js";
import { GraphApiMeta } from "./graph-api.meta.js";
import { MetaController } from "./meta.controller.js";
import { MetaGraph } from "./meta-graph.js";
import { MetaService } from "./meta.service.js";
import { TokenCipher } from "./token-cipher.js";

// @Global: posts ask MetaGraph whether Meta is set up (to check connected pages before scheduling);
// the worker (phase 4) will use MetaGraph and TokenCipher to publish.
// The e2e tests replace MetaGraph: builder.overrideProvider(MetaGraph).useValue(new FakeMeta()).
@Global()
@Module({
  imports: [BrandsModule],
  controllers: [MetaController],
  providers: [{ provide: MetaGraph, useClass: GraphApiMeta }, TokenCipher, MetaService],
  exports: [MetaGraph, TokenCipher],
})
export class MetaModule {}
