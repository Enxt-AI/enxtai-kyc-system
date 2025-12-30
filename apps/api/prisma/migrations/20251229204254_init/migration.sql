-- CreateEnum
CREATE TYPE "KYCStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'VERIFIED', 'CVL_SUBMITTED', 'CVL_VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('MANUAL_UPLOAD', 'DIGILOCKER');

-- CreateEnum
CREATE TYPE "InternalStatus" AS ENUM ('PENDING', 'DOCUMENTS_UPLOADED', 'OCR_COMPLETED', 'FACE_VERIFIED', 'VERIFIED', 'REJECTED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "FinalStatus" AS ENUM ('INCOMPLETE', 'COMPLETE', 'REJECTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "kycStatus" "KYCStatus" NOT NULL DEFAULT 'PENDING',
    "cvlKraId" TEXT,
    "cvlKraStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_submissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentSource" "DocumentSource" NOT NULL,
    "panDocumentUrl" TEXT,
    "aadhaarDocumentUrl" TEXT,
    "livePhotoUrl" TEXT,
    "panNumber" TEXT,
    "aadhaarNumber" TEXT,
    "fullName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "address" JSONB,
    "ocrResults" JSONB,
    "faceMatchScore" DOUBLE PRECISION,
    "livenessScore" DOUBLE PRECISION,
    "faceExtractionSuccess" BOOLEAN NOT NULL DEFAULT false,
    "cvlKraSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "cvlKraSubmissionDate" TIMESTAMP(3),
    "cvlKraResponse" JSONB,
    "cvlKraStatus" TEXT,
    "internalStatus" "InternalStatus" NOT NULL DEFAULT 'PENDING',
    "finalStatus" "FinalStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_cvlKraId_key" ON "users"("cvlKraId");

-- CreateIndex
CREATE INDEX "kyc_submissions_userId_idx" ON "kyc_submissions"("userId");

-- CreateIndex
CREATE INDEX "kyc_submissions_panNumber_idx" ON "kyc_submissions"("panNumber");

-- CreateIndex
CREATE INDEX "kyc_submissions_internalStatus_idx" ON "kyc_submissions"("internalStatus");

-- CreateIndex
CREATE INDEX "kyc_submissions_finalStatus_idx" ON "kyc_submissions"("finalStatus");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
