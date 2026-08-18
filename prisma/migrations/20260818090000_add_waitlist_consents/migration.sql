-- 사전등록 필수 동의 3종 (만 14세 이상 / 개인정보 수집·이용 / 카카오 알림톡 수신)
-- 기존 행은 동의 시점을 알 수 없으므로 false·NULL 로 남긴다.
ALTER TABLE "Waitlist"
  ADD COLUMN "ageOver14Agreed"     BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN "privacyAgreed"       BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN "kakaoAlimtalkAgreed" BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN "agreedAt"            TIMESTAMP(3);
