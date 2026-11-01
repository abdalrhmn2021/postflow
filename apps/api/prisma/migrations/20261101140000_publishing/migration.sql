-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'PUBLISHING';

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PUBLISHED', 'FAILED');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "failReason" TEXT;

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "status" "PublicationStatus" NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_postId_platform_key" ON "Publication"("postId", "platform");

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
