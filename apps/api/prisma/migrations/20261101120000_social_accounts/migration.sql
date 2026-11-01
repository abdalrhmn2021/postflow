-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('OK', 'NEEDS_RECONNECT');

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "pagePicture" TEXT,
    "instagramId" TEXT,
    "instagramUsername" TEXT,
    "instagramPicture" TEXT,
    "pageToken" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'OK',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_brandId_key" ON "SocialAccount"("brandId");

-- CreateIndex
CREATE INDEX "SocialAccount_pageId_idx" ON "SocialAccount"("pageId");

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
