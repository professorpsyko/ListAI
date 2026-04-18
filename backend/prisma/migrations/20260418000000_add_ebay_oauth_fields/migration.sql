-- AlterTable: add eBay OAuth token fields to User
ALTER TABLE "User" ADD COLUMN "ebayAccessToken" TEXT,
ADD COLUMN "ebayRefreshToken" TEXT,
ADD COLUMN "ebayTokenExpiry" TIMESTAMP(3);
