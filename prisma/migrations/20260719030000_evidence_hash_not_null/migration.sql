-- Fill any legacy NULL evidenceHash rows with a stable placeholder before adding NOT NULL constraint.
-- NULL hashes could slip past the unique index (Postgres treats each NULL as distinct),
-- allowing silent duplicate evidence rows. Making the column required closes the gap.
UPDATE "RiskEvidence"
SET "evidenceHash" = md5("serviceAccountId" || '-' || id || '-legacy')
WHERE "evidenceHash" IS NULL;

ALTER TABLE "RiskEvidence" ALTER COLUMN "evidenceHash" SET NOT NULL;
