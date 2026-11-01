import { Global, Module } from "@nestjs/common";
import { GraphApiMeta } from "./graph-api.meta.js";
import { MetaGraph } from "./meta-graph.js";
import { TokenCipher } from "./token-cipher.js";

// Meta's Graph API and the token cipher - shared by the API (connecting pages, checking them before
// scheduling) and the worker (publishing). No routes here, so the worker can load it as it is.
// The e2e tests replace MetaGraph: builder.overrideProvider(MetaGraph).useValue(new FakeMeta()).
@Global()
@Module({
  providers: [{ provide: MetaGraph, useClass: GraphApiMeta }, TokenCipher],
  exports: [MetaGraph, TokenCipher],
})
export class MetaCoreModule {}
