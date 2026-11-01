import { Global, Module } from "@nestjs/common";
import { PublishQueue } from "./publish.queue.js";

// The publish queue: the API adds jobs (posts.service), the worker takes them (worker/publish.worker.ts).
@Global()
@Module({
  providers: [PublishQueue],
  exports: [PublishQueue],
})
export class PublishModule {}
