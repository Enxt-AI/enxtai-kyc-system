/*
  Warnings:

  - You are about to drop the column `aadhaarBackUrl` on the `kyc_submissions` table. All the data in the column will be lost.
  - You are about to drop the column `aadhaarFrontUrl` on the `kyc_submissions` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "kyc_submissions" DROP COLUMN "aadhaarBackUrl",
DROP COLUMN "aadhaarFrontUrl";
