import {
  computeSecurityScore,
  countActionRequired,
  isActiveForHomeMetrics,
} from './metrics';

describe('metrics', () => {
  const sample = [
    { riskLevel: 'high', status: 'action_required' },
    { riskLevel: 'medium', status: 'action_required' },
    { riskLevel: 'low', status: 'watch' },
    { riskLevel: 'safe', status: 'safe' },
    { riskLevel: 'high', status: 'resolved' },
  ];

  it('counts only action_required (excludes watch)', () => {
    expect(countActionRequired(sample)).toBe(2);
  });

  it('computes security score with shared formula', () => {
    // 100 - 12*2 - 6*1 - 2*1 + 3*1 = 100 - 24 - 6 - 2 + 3 = 71
    // high: two (action_required + resolved both count by riskLevel)
    // medium: one, low: one, resolved: one
    expect(computeSecurityScore(sample)).toBe(
      Math.max(0, Math.min(100, 100 - 24 - 6 - 2 + 3)),
    );
  });

  it('filters dormant/skipped from home metrics', () => {
    expect(isActiveForHomeMetrics('dormant')).toBe(false);
    expect(isActiveForHomeMetrics('skipped')).toBe(false);
    expect(isActiveForHomeMetrics('action_required')).toBe(true);
  });
});
