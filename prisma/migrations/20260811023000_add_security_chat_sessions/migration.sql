-- CreateTable (idempotent — table may already exist if prisma db push was used)
CREATE TABLE IF NOT EXISTS "SecurityChatSession" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "SecurityChatSession_chatId_startedAt_idx"
ON "SecurityChatSession"("chatId", "startedAt");

-- AddForeignKey (conditional)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SecurityChatSession_chatId_fkey'
  ) THEN
    ALTER TABLE "SecurityChatSession"
    ADD CONSTRAINT "SecurityChatSession_chatId_fkey"
    FOREIGN KEY ("chatId") REFERENCES "SecurityChat"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill one legacy session so conversations created before this migration
-- remain visible in the session history UI. (ON CONFLICT = idempotent)
INSERT INTO "SecurityChatSession" ("id", "chatId", "startedAt")
SELECT
    CONCAT('legacy-', chat."id"),
    chat."id",
    COALESCE(MIN(message."createdAt"), chat."createdAt")
FROM "SecurityChat" AS chat
LEFT JOIN "SecurityChatMessage" AS message ON message."chatId" = chat."id"
GROUP BY chat."id", chat."createdAt"
HAVING COUNT(message."id") > 0
ON CONFLICT DO NOTHING;
