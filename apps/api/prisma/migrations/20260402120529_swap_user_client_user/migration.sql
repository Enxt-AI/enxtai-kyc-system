/*
  Warnings:

  - You are about to drop the column `cvlKraId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `cvlKraStatus` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `externalUserId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `kycStatus` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `client_users` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[email]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `password` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";

-- DropForeignKey
ALTER TABLE "client_users" DROP CONSTRAINT "client_users_clientId_fkey";

-- DropForeignKey
ALTER TABLE "digilocker_tokens" DROP CONSTRAINT "digilocker_tokens_userId_fkey";

-- DropForeignKey
ALTER TABLE "kyc_submissions" DROP CONSTRAINT "kyc_submissions_userId_clientId_fkey";

-- DropIndex
DROP INDEX "users_clientId_email_idx";

-- DropIndex
DROP INDEX "users_clientId_email_key";

-- DropIndex
DROP INDEX "users_clientId_externalUserId_key";

-- DropIndex
DROP INDEX "users_clientId_phone_key";

-- DropIndex
DROP INDEX "users_cvlKraId_key";

-- DropIndex
DROP INDEX "users_id_clientId_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "cvlKraId",
DROP COLUMN "cvlKraStatus",
DROP COLUMN "externalUserId",
DROP COLUMN "kycStatus",
DROP COLUMN "phone",
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password" TEXT NOT NULL,
ADD COLUMN     "resetToken" TEXT,
ADD COLUMN     "resetTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "role" "ClientUserRole" NOT NULL DEFAULT 'VIEWER',
ALTER COLUMN "clientId" DROP NOT NULL;

-- DropTable
DROP TABLE "client_users";

-- CreateTable
CREATE TABLE "clientUsers" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kycStatus" "KYCStatus" NOT NULL DEFAULT 'PENDING',
    "cvlKraId" TEXT,
    "cvlKraStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientUsers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientUsers_cvlKraId_key" ON "clientUsers"("cvlKraId");

-- CreateIndex
CREATE INDEX "clientUsers_clientId_idx" ON "clientUsers"("clientId");

-- CreateIndex
CREATE INDEX "clientUsers_clientId_email_idx" ON "clientUsers"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "clientUsers_id_clientId_key" ON "clientUsers"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "clientUsers_clientId_externalUserId_key" ON "clientUsers"("clientId", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "clientUsers_clientId_email_key" ON "clientUsers"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "clientUsers_clientId_phone_key" ON "clientUsers"("clientId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_resetToken_idx" ON "users"("resetToken");

-- AddForeignKey
ALTER TABLE "clientUsers" ADD CONSTRAINT "clientUsers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_userId_clientId_fkey" FOREIGN KEY ("userId", "clientId") REFERENCES "clientUsers"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "clientUsers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digilocker_tokens" ADD CONSTRAINT "digilocker_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "clientUsers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
