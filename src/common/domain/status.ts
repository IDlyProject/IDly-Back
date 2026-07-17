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
