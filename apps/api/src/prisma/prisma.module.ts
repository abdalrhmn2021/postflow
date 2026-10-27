import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

// @Global: any module can inject PrismaService without importing PrismaModule again.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
