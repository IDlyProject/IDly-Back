-- Persist AI account identifiers and service-account skip state.
ALTER TABLE "ServiceAccount" ADD COLUMN "aiAccountId" TEXT;
ALTER TABLE "ServiceAccount" ADD COLUMN "skippedAt" TIMESTAMP(3);

-- Evidence hashes are generated from non-body metadata so repeated AI evidence
-- does not create duplicate detail rows.
CREATE UNIQUE INDEX "RiskEvidence_serviceAccountId_evidenceHash_key"
ON "RiskEvidence"("serviceAccountId", "evidenceHash");
