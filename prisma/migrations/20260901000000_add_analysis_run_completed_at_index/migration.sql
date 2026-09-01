-- home.service.ts의 lastRun 쿼리 (WHERE userId AND status='completed' ORDER BY completedAt DESC) filesort 제거
CREATE INDEX IF NOT EXISTS "AnalysisRun_userId_completedAt_idx" ON "AnalysisRun"("userId", "completedAt");
