-- Add signature URL for digital signature uploads
ALTER TABLE "kyc_submissions"
ADD COLUMN IF NOT EXISTS "signatureUrl" TEXT;
