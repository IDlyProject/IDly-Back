/**
 * Mirrors AnalysisService.nextStatus / RisksService.nextStatus rules for regression.
 */

import { restoreAccountStatus } from './status';

type AccountStatus =
  | 'action_required'
  | 'watch'
  | 'safe'
  | 'resolved'
  | 'skipped'
  | 'dormant';

function nextAnalysisStatus(
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

function nextUserActionStatus(
  requestedStatus: 'resolved' | 'skipped' | 'pending',
  riskLevel: string,
): string {
  if (requestedStatus === 'resolved') return 'resolved';
  if (requestedStatus === 'skipped') return 'skipped';
  if (riskLevel === 'high' || riskLevel === 'medium') return 'action_required';
  if (riskLevel === 'low') return 'watch';
  return 'safe';
}

describe('status transitions', () => {
  it('keeps resolved when no new evidence', () => {
    expect(
      nextAnalysisStatus('resolved', 'action_required', false),
    ).toBe('resolved');
  });

  it('reopens resolved when new evidence arrives', () => {
    expect(
      nextAnalysisStatus('resolved', 'action_required', true),
    ).toBe('action_required');
  });

  it('keeps dormant regardless of computed status', () => {
    expect(nextAnalysisStatus('dormant', 'action_required', true)).toBe(
      'dormant',
    );
  });

  it('maps pending back to risk-based status', () => {
    expect(nextUserActionStatus('pending', 'high')).toBe('action_required');
    expect(nextUserActionStatus('pending', 'low')).toBe('watch');
    expect(nextUserActionStatus('pending', 'safe')).toBe('safe');
  });

  it('never restores to dormant or unknown status', () => {
    expect(restoreAccountStatus('watch')).toBe('watch');
    expect(restoreAccountStatus('dormant')).toBe('safe');
    expect(restoreAccountStatus('bad-status')).toBe('safe');
    expect(restoreAccountStatus(null)).toBe('safe');
  });
});
