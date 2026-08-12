-- Add sessionId (nullable) to SecurityChatMessage.
-- The original table creation (20260719000000) did not include this column;
-- SecurityChatSession was introduced later via prisma db push + 20260811023000.
-- Existing rows keep sessionId NULL (legacy); new messages always supply a sessionId.

ALTER TABLE "SecurityChatMessage"
  ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

-- Index (idempotent)
CREATE INDEX IF NOT EXISTS "SecurityChatMessage_sessionId_createdAt_idx"
  ON "SecurityChatMessage"("sessionId", "createdAt");

-- FK (conditional)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SecurityChatMessage_sessionId_fkey'
  ) THEN
    ALTER TABLE "SecurityChatMessage"
      ADD CONSTRAINT "SecurityChatMessage_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "SecurityChatSession"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
