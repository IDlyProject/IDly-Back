-- Hot path: find running / recent analysis runs per user
CREATE INDEX IF NOT EXISTS "AnalysisRun_userId_status_idx"
ON "AnalysisRun"("userId", "status");

CREATE INDEX IF NOT EXISTS "AnalysisRun_userId_startedAt_idx"
ON "AnalysisRun"("userId", "startedAt");

-- Ownership lookups for service accounts via gmail account
CREATE INDEX IF NOT EXISTS "ServiceAccount_gmailAccountId_status_idx"
ON "ServiceAccount"("gmailAccountId", "status");
