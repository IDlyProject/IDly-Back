-- AlterTable User: add lastLoginAt for account management screen.
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- CreateTable WithdrawalLog: anonymous withdrawal analytics retained after hard delete.
CREATE TABLE "WithdrawalLog" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonDetail" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WithdrawalLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WithdrawalLog_reason_deletedAt_idx" ON "WithdrawalLog"("reason", "deletedAt");
