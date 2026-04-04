-- AlterTable
ALTER TABLE "kyc_submissions" ADD COLUMN     "uiStep" TEXT NOT NULL DEFAULT 'upload',
ALTER COLUMN "documentSource" SET DEFAULT 'MANUAL_UPLOAD';
