-- AlterTable User: add individual notification alert preference fields
ALTER TABLE "User" ADD COLUMN "alertSuspiciousLogin" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "alertPasswordChange" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "alertNewDevice" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "alertRecoveryEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "alertSecurityTip" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "alertEventPromo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable ServiceAccount: add dormant tracking fields
ALTER TABLE "ServiceAccount" ADD COLUMN "dormantAt" TIMESTAMP(3);
ALTER TABLE "ServiceAccount" ADD COLUMN "previousStatus" TEXT;

-- Backfill existing dormant rows created before dormantAt/previousStatus existed.
UPDATE "ServiceAccount"
SET
  "dormantAt" = COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP),
  "previousStatus" = COALESCE(NULLIF("previousStatus", 'dormant'), 'safe')
WHERE "status" = 'dormant';

-- Support 4-1 dormant account list filtering + newest-first ordering.
CREATE INDEX "ServiceAccount_gmailAccountId_status_dormantAt_idx"
ON "ServiceAccount"("gmailAccountId", "status", "dormantAt");
