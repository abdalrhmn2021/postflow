-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "platforms" "Platform"[] DEFAULT ARRAY[]::"Platform"[],
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "brandId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_brandId_scheduledAt_idx" ON "Post"("brandId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Post_createdById_idx" ON "Post"("createdById");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Written by hand (Prisma's schema can't say this): anything past a draft has a time and at least
-- one platform. The API checks the same thing first and answers with a clear error; this is the
-- safety net, so a bug can never hand the worker a post it can't publish.
ALTER TABLE "Post" ADD CONSTRAINT "Post_scheduled_is_complete"
    CHECK ("status" = 'DRAFT' OR ("scheduledAt" IS NOT NULL AND cardinality("platforms") > 0));
