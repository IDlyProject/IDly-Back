ALTER TABLE "GmailAccount"
ADD COLUMN "historyId" VARCHAR(32),
ADD COLUMN "watchHistoryId" VARCHAR(32),
ADD COLUMN "watchStatus" TEXT NOT NULL DEFAULT 'disabled',
ADD COLUMN "watchExpiration" TIMESTAMP(3),
ADD COLUMN "watchLastRenewedAt" TIMESTAMP(3),
ADD COLUMN "lastPushAt" TIMESTAMP(3),
ADD COLUMN "lastIncrementalSyncedAt" TIMESTAMP(3),
ADD COLUMN "nextRepairAt" TIMESTAMP(3),
ADD COLUMN "syncLeaseOwner" TEXT,
ADD COLUMN "syncLeaseUntil" TIMESTAMP(3);

CREATE TABLE "GmailPushEvent" (
    "id" TEXT NOT NULL,
    "pubsubMessageId" TEXT NOT NULL,
    "gmailAccountId" TEXT NOT NULL,
    "notifiedHistoryId" VARCHAR(32) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "GmailPushEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GmailSyncJob" (
    "id" TEXT NOT NULL,
    "gmailAccountId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "targetHistoryId" VARCHAR(32),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "GmailSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GmailProcessedMessage" (
    "id" TEXT NOT NULL,
    "gmailAccountId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "historyId" VARCHAR(32),
    "analysisRunId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GmailProcessedMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailPushEvent_pubsubMessageId_key"
ON "GmailPushEvent"("pubsubMessageId");

CREATE INDEX "GmailPushEvent_gmailAccountId_status_idx"
ON "GmailPushEvent"("gmailAccountId", "status");

CREATE INDEX "GmailSyncJob_status_availableAt_idx"
ON "GmailSyncJob"("status", "availableAt");

CREATE INDEX "GmailSyncJob_gmailAccountId_status_idx"
ON "GmailSyncJob"("gmailAccountId", "status");

CREATE INDEX "GmailSyncJob_gmailAccountId_trigger_createdAt_idx"
ON "GmailSyncJob"("gmailAccountId", "trigger", "createdAt");

CREATE UNIQUE INDEX "GmailSyncJob_one_active_per_account"
ON "GmailSyncJob"("gmailAccountId")
WHERE "status" IN ('pending', 'processing', 'retry');

CREATE UNIQUE INDEX "GmailProcessedMessage_gmailAccountId_gmailMessageId_key"
ON "GmailProcessedMessage"("gmailAccountId", "gmailMessageId");

CREATE INDEX "GmailProcessedMessage_gmailAccountId_processedAt_idx"
ON "GmailProcessedMessage"("gmailAccountId", "processedAt");

CREATE INDEX "GmailAccount_watchStatus_watchExpiration_idx"
ON "GmailAccount"("watchStatus", "watchExpiration");

CREATE INDEX "GmailAccount_syncLeaseUntil_idx"
ON "GmailAccount"("syncLeaseUntil");

CREATE INDEX "GmailAccount_nextRepairAt_idx"
ON "GmailAccount"("nextRepairAt");

ALTER TABLE "GmailPushEvent"
ADD CONSTRAINT "GmailPushEvent_gmailAccountId_fkey"
FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GmailSyncJob"
ADD CONSTRAINT "GmailSyncJob_gmailAccountId_fkey"
FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GmailProcessedMessage"
ADD CONSTRAINT "GmailProcessedMessage_gmailAccountId_fkey"
FOREIGN KEY ("gmailAccountId") REFERENCES "GmailAccount"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
