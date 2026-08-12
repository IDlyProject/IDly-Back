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
    // raw 68, high가 남아 있으므로 양호 구간(80+)에 들어갈 수 없다.
    expect(computeSecurityScore(sample)).toBe(68);
  });

  it('does not reward resolved accounts or show a remaining high risk as safe', () => {
    expect(computeSecurityScore([{ riskLevel: 'safe', status: 'resolved' }])).toBe(100);
    expect(computeSecurityScore([{ riskLevel: 'high', status: 'action_required' }])).toBe(79);
  });

  it('filters dormant/skipped from home metrics', () => {
    expect(isActiveForHomeMetrics('dormant')).toBe(false);
    expect(isActiveForHomeMetrics('skipped')).toBe(false);
    expect(isActiveForHomeMetrics('action_required')).toBe(true);
  });
});
