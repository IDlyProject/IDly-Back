-- AlterTable User: add lastLoginAt for account management screen, scheduledDeleteAt for soft delete, deleteReason/deleteReasonDetail for withdrawal analytics
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "scheduledDeleteAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deleteReason" TEXT;
ALTER TABLE "User" ADD COLUMN "deleteReasonDetail" TEXT;
ALTER TABLE "User" ADD COLUMN "tokenInvalidatedAt" TIMESTAMP(3);
