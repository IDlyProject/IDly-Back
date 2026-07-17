-- Support 4-1 dormant account list filtering + newest-first ordering.
CREATE INDEX "ServiceAccount_gmailAccountId_status_dormantAt_idx"
ON "ServiceAccount"("gmailAccountId", "status", "dormantAt");
