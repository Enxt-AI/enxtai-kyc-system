-- AlterEnum
ALTER TYPE "ClientUserRole" ADD VALUE 'SUPER_ADMIN';

-- DropForeignKey
ALTER TABLE "kyc_submissions" DROP CONSTRAINT "kyc_submissions_userId_fkey";

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "users_phone_key";

-- AlterTable
ALTER TABLE "client_users" ALTER COLUMN "clientId" DROP NOT NULL;
