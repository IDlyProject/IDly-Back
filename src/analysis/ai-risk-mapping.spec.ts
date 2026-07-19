import {
  inferRiskType,
  riskLevelToAccountStatus,
  toHeadline,
  toRiskLevel,
} from './ai-risk-mapping';
import { nextAnalysisAccountStatus } from '../common/domain/status';

describe('ai-risk-mapping', () => {
  it('maps AI security levels to risk levels', () => {
    expect(toRiskLevel('위험', 8, 'new_device_login')).toBe('high');
    expect(toRiskLevel('위험', 3, null)).toBe('medium');
    expect(toRiskLevel('주의', 9, null)).toBe('high');
    expect(toRiskLevel('주의', 5, null)).toBe('medium');
    expect(toRiskLevel('양호', 2, null)).toBe('safe');
    expect(toRiskLevel('양호', 5, null)).toBe('low');
  });

  it('does not let force-high security signals sink to low or safe', () => {
    expect(toRiskLevel('양호', 6, 'verification_code')).toBe('medium');
    expect(toRiskLevel(undefined, 4, 'account_recovery')).toBe('high');
    expect(toRiskLevel(undefined, undefined, 'password_reset')).toBe('medium');
  });

  it('falls back to score when security level is unknown', () => {
    expect(toRiskLevel('UNKNOWN', 8, null)).toBe('high');
    expect(toRiskLevel('UNKNOWN', 5, null)).toBe('medium');
    expect(toRiskLevel('UNKNOWN', 1, null)).toBe('low');
    expect(toRiskLevel('UNKNOWN', 0, null)).toBe('safe');
  });

  it('treats AI security_score as risk signal strength, not app securityScore', () => {
    expect(toRiskLevel('양호', 8, null)).toBe('low');
    expect(toRiskLevel('위험', 8, null)).toBe('high');
  });

  it('maps risk level to account status', () => {
    expect(riskLevelToAccountStatus('high')).toBe('action_required');
    expect(riskLevelToAccountStatus('medium')).toBe('action_required');
    expect(riskLevelToAccountStatus('low')).toBe('watch');
    expect(riskLevelToAccountStatus('safe')).toBe('safe');
  });

  it('infers risk type from mail subjects', () => {
    expect(
      inferRiskType({
        problem_mails: [{ subject: '새 기기에서 로그인했습니다' }],
      }),
    ).toBe('new_device_login');
    expect(
      inferRiskType({
        problem_mails: [{ subject: 'Password reset requested' }],
      }),
    ).toBe('password_reset');
    expect(
      inferRiskType({
        problem_mails: [{ subject: '일반 안내' }],
      }),
    ).toBe('security_recommendation');
  });

  it('keeps resolved without new evidence via shared nextStatus', () => {
    expect(
      nextAnalysisAccountStatus('resolved', 'action_required', false),
    ).toBe('resolved');
    expect(nextAnalysisAccountStatus('resolved', 'action_required', true)).toBe(
      'action_required',
    );
  });

  it('builds stable headlines', () => {
    expect(toHeadline('high')).toContain('확인');
    expect(toHeadline('safe')).toContain('지켜');
  });
});
