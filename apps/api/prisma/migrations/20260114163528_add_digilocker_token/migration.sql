-- CreateTable
CREATE TABLE "digilocker_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "digilocker_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "digilocker_tokens_userId_key" ON "digilocker_tokens"("userId");

-- CreateIndex
CREATE INDEX "digilocker_tokens_userId_idx" ON "digilocker_tokens"("userId");

-- CreateIndex
CREATE INDEX "digilocker_tokens_expiresAt_idx" ON "digilocker_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "digilocker_tokens" ADD CONSTRAINT "digilocker_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
