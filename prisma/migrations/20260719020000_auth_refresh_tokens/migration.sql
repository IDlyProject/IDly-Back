-- App auth refresh tokens (rotation / revoke). Independent from Gmail OAuth refreshToken.
CREATE TABLE IF NOT EXISTS "AuthRefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthRefreshToken_tokenHash_key" ON "AuthRefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthRefreshToken_userId_expiresAt_idx" ON "AuthRefreshToken"("userId", "expiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuthRefreshToken_userId_fkey'
  ) THEN
    ALTER TABLE "AuthRefreshToken"
      ADD CONSTRAINT "AuthRefreshToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
