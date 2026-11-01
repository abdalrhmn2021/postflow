import { Module } from "@nestjs/common";
import { AppConfigModule } from "../config/config.module.js";
import { MetaCoreModule } from "../meta/meta-core.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PublishModule } from "../publish/publish.module.js";
import { PublisherService } from "../publish/publisher.service.js";
import { RedisModule } from "../redis/redis.module.js";
import { HeartbeatService } from "./heartbeat.service.js";
import { PublishWorker } from "./publish.worker.js";

// The background worker: same code, same database, but no HTTP server.
// It publishes scheduled posts (PublishWorker -> PublisherService -> Meta) and says it's alive (heartbeat).
@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, MetaCoreModule, PublishModule],
  providers: [HeartbeatService, PublisherService, PublishWorker],
})
export class WorkerModule {}
