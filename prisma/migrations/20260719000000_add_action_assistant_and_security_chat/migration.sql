-- ActionItem: add type, why columns (IF NOT EXISTS — may already exist via db push)
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "why" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "externalUrl" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ActionItem" ADD COLUMN IF NOT EXISTS "serviceAccountId" TEXT;

-- ActionItem: indexes
CREATE INDEX IF NOT EXISTS "ActionItem_serviceAccountId_status_idx" ON "ActionItem"("serviceAccountId", "status");

-- ActionSession
CREATE TABLE IF NOT EXISTS "ActionSession" (
    "id" TEXT NOT NULL,
    "serviceAccountId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "activeActionItemId" TEXT,
    "feedbackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "composerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "composerPlaceholder" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActionSession_serviceAccountId_status_idx" ON "ActionSession"("serviceAccountId", "status");

DO $$
BEGIN
  ALTER TABLE "ActionSession" ADD CONSTRAINT "ActionSession_serviceAccountId_fkey"
      FOREIGN KEY ("serviceAccountId") REFERENCES "ServiceAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ActionMessage
CREATE TABLE IF NOT EXISTS "ActionMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActionMessage_sessionId_createdAt_idx" ON "ActionMessage"("sessionId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "ActionMessage" ADD CONSTRAINT "ActionMessage_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "ActionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ActionAttempt
CREATE TABLE IF NOT EXISTS "ActionAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actionItemId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "reasonCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionAttempt_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "ActionAttempt" ADD CONSTRAINT "ActionAttempt_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "ActionSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ActionAttempt" ADD CONSTRAINT "ActionAttempt_actionItemId_fkey"
      FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SecurityChat
CREATE TABLE IF NOT EXISTS "SecurityChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityChat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SecurityChat_userId_key" ON "SecurityChat"("userId");

DO $$
BEGIN
  ALTER TABLE "SecurityChat" ADD CONSTRAINT "SecurityChat_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- SecurityChatMessage
CREATE TABLE IF NOT EXISTS "SecurityChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SecurityChatMessage_chatId_createdAt_idx" ON "SecurityChatMessage"("chatId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "SecurityChatMessage" ADD CONSTRAINT "SecurityChatMessage_chatId_fkey"
      FOREIGN KEY ("chatId") REFERENCES "SecurityChat"("id") ON DELETE CASCADE ON UPDATE CASCADE
      NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
