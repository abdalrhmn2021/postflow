-- CreateEnum
CREATE TYPE "Approval" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "approval" "Approval" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "approvalAt" TIMESTAMP(3),
ADD COLUMN     "approvalNote" TEXT;

-- CreateTable
CREATE TABLE "ReviewLink" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewLink_tokenHash_key" ON "ReviewLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ReviewLink_brandId_idx" ON "ReviewLink"("brandId");

-- AddForeignKey
ALTER TABLE "ReviewLink" ADD CONSTRAINT "ReviewLink_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
