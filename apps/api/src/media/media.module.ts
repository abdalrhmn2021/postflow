import { Global, Module } from "@nestjs/common";
import { CloudinaryStorage } from "./cloudinary.storage.js";
import { MediaStorage } from "./media-storage.js";

// @Global: posts attach files, brands delete a whole brand's files. Both just inject MediaStorage.
// The e2e tests replace it: builder.overrideProvider(MediaStorage).useValue(new FakeMediaStorage()).
@Global()
@Module({
  providers: [{ provide: MediaStorage, useClass: CloudinaryStorage }],
  exports: [MediaStorage],
})
export class MediaModule {}
