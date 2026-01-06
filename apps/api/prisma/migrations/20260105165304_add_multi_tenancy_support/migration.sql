/*
  Warnings:

  - A unique constraint covering the columns `[clientId,externalUserId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `clientId` to the `kyc_submissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clientId` to the `users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalUserId` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL');

-- CreateEnum
CREATE TYPE "ClientUserRole" AS ENUM ('ADMIN', 'VIEWER');

-- CreateTable for clients FIRST (before adding foreign keys)
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiKeyPlaintext" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- Insert a default "Legacy Client" for existing data
INSERT INTO "clients" ("id", "name", "apiKey", "status", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000000', 'Legacy Client', 'legacy_key_hash_placeholder', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable: Add columns as NULLABLE first
ALTER TABLE "kyc_submissions" ADD COLUMN "clientId" TEXT;
ALTER TABLE "users" ADD COLUMN "clientId" TEXT;
ALTER TABLE "users" ADD COLUMN "externalUserId" TEXT;

-- Backfill existing data with the legacy client ID
UPDATE "kyc_submissions" SET "clientId" = '00000000-0000-0000-0000-000000000000' WHERE "clientId" IS NULL;
UPDATE "users" SET "clientId" = '00000000-0000-0000-0000-000000000000' WHERE "clientId" IS NULL;
UPDATE "users" SET "externalUserId" = "id" WHERE "externalUserId" IS NULL;

-- Now make the columns NOT NULL
ALTER TABLE "kyc_submissions" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "externalUserId" SET NOT NULL;

-- Drop existing global unique constraints on email and phone
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_phone_key";

-- CreateTable
CREATE TABLE "client_users" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "ClientUserRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_apiKey_key" ON "clients"("apiKey");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "client_users_email_key" ON "client_users"("email");

-- CreateIndex
CREATE INDEX "client_users_clientId_idx" ON "client_users"("clientId");

-- CreateIndex
CREATE INDEX "client_users_email_idx" ON "client_users"("email");

-- CreateIndex
CREATE INDEX "webhook_logs_clientId_idx" ON "webhook_logs"("clientId");

-- CreateIndex
CREATE INDEX "webhook_logs_clientId_createdAt_idx" ON "webhook_logs"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_logs_event_idx" ON "webhook_logs"("event");

-- CreateIndex
CREATE INDEX "kyc_submissions_clientId_idx" ON "kyc_submissions"("clientId");

-- CreateIndex
CREATE INDEX "kyc_submissions_clientId_internalStatus_idx" ON "kyc_submissions"("clientId", "internalStatus");

-- CreateIndex
CREATE INDEX "users_clientId_idx" ON "users"("clientId");

-- CreateIndex
CREATE INDEX "users_clientId_email_idx" ON "users"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_id_clientId_key" ON "users"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "users_clientId_externalUserId_key" ON "users"("clientId", "externalUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_clientId_email_key" ON "users"("clientId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_clientId_phone_key" ON "users"("clientId", "phone");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (composite FK for tenant-scoped user reference)
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_userId_clientId_fkey" FOREIGN KEY ("userId", "clientId") REFERENCES "users"("id", "clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_logs" ADD CONSTRAINT "webhook_logs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
