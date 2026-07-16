/**
 * Shared home / action-status metrics so HomeService and RisksService stay aligned.
 *
 * - actionRequiredCount: status === 'action_required' only (watch / low is excluded)
 * - securityScore: 0–100 derived from riskLevel + resolved count
 * - dormant / skipped accounts must be filtered out before calling these helpers
 */

export type MetricAccount = {
  riskLevel: string;
  status: string;
};

export function countActionRequired(accounts: MetricAccount[]): number {
  return accounts.filter((a) => a.status === 'action_required').length;
}

export function computeSecurityScore(accounts: MetricAccount[]): number {
  const highCount = accounts.filter((a) => a.riskLevel === 'high').length;
  const mediumCount = accounts.filter((a) => a.riskLevel === 'medium').length;
  const lowCount = accounts.filter((a) => a.riskLevel === 'low').length;
  const resolvedCount = accounts.filter((a) => a.status === 'resolved').length;

  return Math.max(
    0,
    Math.min(
      100,
      100 - highCount * 12 - mediumCount * 6 - lowCount * 2 + resolvedCount * 3,
    ),
  );
}

/** Active accounts for home metrics: exclude dormant and skipped. */
export function isActiveForHomeMetrics(status: string): boolean {
  return status !== 'dormant' && status !== 'skipped';
}
