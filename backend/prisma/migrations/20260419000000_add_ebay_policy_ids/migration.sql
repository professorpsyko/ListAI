-- AlterTable: add eBay Business Policy ID fields to User
ALTER TABLE "User"
  ADD COLUMN "ebayFulfillmentPolicyId" TEXT,
  ADD COLUMN "ebayReturnPolicyId" TEXT,
  ADD COLUMN "ebayPaymentPolicyId" TEXT;
