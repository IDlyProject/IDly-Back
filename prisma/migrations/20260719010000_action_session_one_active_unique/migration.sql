-- 서비스 계정당 active ActionSession 1개만 허용 (동시 POST create 레이스 방어)
-- 기존 중복 active가 있으면 최신 1개만 남기고 나머지는 abandoned 처리
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "serviceAccountId"
      ORDER BY "startedAt" DESC, id DESC
    ) AS rn
  FROM "ActionSession"
  WHERE status = 'active'
)
UPDATE "ActionSession" AS s
SET
  status = 'abandoned',
  "completedAt" = COALESCE(s."completedAt", CURRENT_TIMESTAMP),
  "feedbackEnabled" = false,
  "composerEnabled" = false,
  "composerPlaceholder" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked AS r
WHERE s.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "ActionSession_one_active_per_sa"
ON "ActionSession"("serviceAccountId")
WHERE status = 'active';
