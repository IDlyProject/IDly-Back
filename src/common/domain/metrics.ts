/**
 * Shared home / action-status metrics so HomeService and RisksService stay aligned.
 *
 * - actionRequiredCount: status === 'action_required' only (watch / low is excluded)
 * - securityScore: 0–100 derived from active riskLevel counts
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

  const rawScore = Math.max(
    0,
    Math.min(100, 100 - highCount * 12 - mediumCount * 6 - lowCount * 2),
  );

  // 해결 보너스는 이슈 제거와 중복 가산이 되므로 두지 않는다. 또한 high가
  // 하나라도 남아 있으면 홈이 "양호(80+)"로 보이지 않도록 상한을 건다.
  return highCount > 0 ? Math.min(rawScore, 79) : rawScore;
}

/** Active accounts for home metrics: exclude dormant and skipped. */
export function isActiveForHomeMetrics(status: string): boolean {
  return status !== 'dormant' && status !== 'skipped';
}
