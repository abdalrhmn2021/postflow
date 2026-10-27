import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import type { Env } from "../config/env.js";

// One database client for the whole process. Prisma 7 talks to PostgreSQL through a driver
// adapter (here node-postgres, `pg`), so the connection string is passed in code, not in schema.prisma.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(config: ConfigService<Env, true>) {
    super({ adapter: new PrismaPg({ connectionString: config.get("DATABASE_URL", { infer: true }) }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  // Last shutdown step, like RedisService: a job finishing during shutdown can still save its result.
  async onApplicationShutdown() {
    await this.$disconnect();
  }
}
