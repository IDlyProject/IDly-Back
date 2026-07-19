/** Canonical domain status / risk values (DB stores as string; app enforces set). */

export const RISK_LEVELS = ['high', 'medium', 'low', 'safe'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const ACCOUNT_STATUSES = [
  'action_required',
  'watch',
  'safe',
  'resolved',
  'skipped',
  'dormant',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const RESTORABLE_ACCOUNT_STATUSES = [
  'action_required',
  'watch',
  'safe',
  'resolved',
  'skipped',
] as const;
export type RestorableAccountStatus =
  (typeof RESTORABLE_ACCOUNT_STATUSES)[number];

export function restoreAccountStatus(status: string | null | undefined) {
  return RESTORABLE_ACCOUNT_STATUSES.includes(
    status as RestorableAccountStatus,
  )
    ? (status as RestorableAccountStatus)
    : 'safe';
}

export const ANALYSIS_RUN_STATUSES = [
  'queued',
  'scanning',
  'completed',
  'failed',
] as const;
export type AnalysisRunStatus = (typeof ANALYSIS_RUN_STATUSES)[number];

export const GMAIL_ACCOUNT_STATUSES = [
  'connected',
  'reconnect_required',
] as const;
export type GmailAccountStatus = (typeof GMAIL_ACCOUNT_STATUSES)[number];

/** Stale analysis runs older than this are marked failed on recovery. */
export const ANALYSIS_ORPHAN_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * 동일 유저 연속 분석 시작 최소 간격.
 * startAnalysis 응답 스키마는 동일하고, 너무 잦으면 기존과 같이 429 메시지를 반환한다.
 */
export const ANALYSIS_COOLDOWN_MS = 300_000; // 5 minutes

/**
 * 재분석 시 ServiceAccount.status 병합 규칙 (API 응답 shape 불변).
 * - 새 근거 없으면 resolved/skipped 유지
 * - dormant는 유지
 */
export function nextAnalysisAccountStatus(
  existingStatus: AccountStatus | undefined,
  computedStatus: AccountStatus,
  hasNewEvidence: boolean,
): AccountStatus {
  if (
    !hasNewEvidence &&
    (existingStatus === 'resolved' || existingStatus === 'skipped')
  ) {
    return existingStatus;
  }
  if (existingStatus === 'dormant') return 'dormant';
  return computedStatus;
}
