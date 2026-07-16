-- AlterTable
ALTER TABLE "User" ADD COLUMN "notificationAgreed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "marketingAgreed" BOOLEAN NOT NULL DEFAULT false;
