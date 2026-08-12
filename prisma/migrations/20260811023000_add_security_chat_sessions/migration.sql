-- CreateTable
CREATE TABLE "SecurityChatSession" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityChatSession_chatId_startedAt_idx"
ON "SecurityChatSession"("chatId", "startedAt");

-- AddForeignKey
ALTER TABLE "SecurityChatSession"
ADD CONSTRAINT "SecurityChatSession_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "SecurityChat"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill one legacy session so conversations created before this migration
-- remain visible in the session history UI.
INSERT INTO "SecurityChatSession" ("id", "chatId", "startedAt")
SELECT
    CONCAT('legacy-', chat."id"),
    chat."id",
    COALESCE(MIN(message."createdAt"), chat."createdAt")
FROM "SecurityChat" AS chat
LEFT JOIN "SecurityChatMessage" AS message ON message."chatId" = chat."id"
GROUP BY chat."id", chat."createdAt"
HAVING COUNT(message."id") > 0;

-- Add the explicit session relation after legacy sessions exist.
ALTER TABLE "SecurityChatMessage"
ADD COLUMN "sessionId" TEXT;

UPDATE "SecurityChatMessage" AS message
SET "sessionId" = CONCAT('legacy-', message."chatId");

ALTER TABLE "SecurityChatMessage"
ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "SecurityChatMessage_sessionId_createdAt_idx"
ON "SecurityChatMessage"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SecurityChatMessage"
ADD CONSTRAINT "SecurityChatMessage_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "SecurityChatSession"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
