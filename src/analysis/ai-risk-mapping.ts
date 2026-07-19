import type { AccountStatus, RiskLevel } from '../common/domain/status';
import { nextAnalysisAccountStatus } from '../common/domain/status';

export type RiskType =
  | 'new_device_login'
  | 'password_reset'
  | 'verification_code'
  | 'account_recovery'
  | 'permission_grant'
  | 'security_recommendation';

export const FORCE_HIGH_RISK_TYPES = new Set<RiskType>([
  'new_device_login',
  'password_reset',
  'verification_code',
  'account_recovery',
]);

export interface AiProblemMailLike {
  subject?: string;
  date?: string;
  body?: string;
  matched_keywords?: string;
}

export interface AiAccountAnalysisLike {
  account_id?: string;
  account?: string;
  security_score?: number;
  security_level?: string;
  interpretation?: string;
  problem_mails?: AiProblemMailLike[];
}

export function toRiskLevel(
  level?: string,
  score?: number,
  riskType?: RiskType | null,
): RiskLevel {
  const normalizedScore =
    typeof score === 'number' && Number.isFinite(score) ? score : null;
  const hasForceHighRisk = riskType
    ? FORCE_HIGH_RISK_TYPES.has(riskType)
    : false;

  if (level === '위험') {
    if (hasForceHighRisk || (normalizedScore ?? 0) >= 7) return 'high';
    return 'medium';
  }

  if (level === '주의') {
    if (hasForceHighRisk || (normalizedScore ?? 0) >= 8) return 'high';
    return 'medium';
  }

  if (level === '양호') {
    if ((normalizedScore ?? 0) >= 6 && hasForceHighRisk) return 'medium';
    if ((normalizedScore ?? 0) >= 4) return 'low';
    return 'safe';
  }

  if (normalizedScore === null) return hasForceHighRisk ? 'medium' : 'safe';
  if (hasForceHighRisk && normalizedScore >= 4) return 'high';
  if (normalizedScore >= 7) return 'high';
  if (normalizedScore >= 4) return 'medium';
  if (normalizedScore > 0) return 'low';
  return 'safe';
}

export function riskLevelToAccountStatus(riskLevel: RiskLevel): AccountStatus {
  if (riskLevel === 'high' || riskLevel === 'medium') return 'action_required';
  if (riskLevel === 'low') return 'watch';
  return 'safe';
}

/** @deprecated use nextAnalysisAccountStatus from domain/status */
export function nextStatus(
  existingStatus: AccountStatus | undefined,
  computedStatus: AccountStatus,
  hasNewEvidence: boolean,
): AccountStatus {
  return nextAnalysisAccountStatus(
    existingStatus,
    computedStatus,
    hasNewEvidence,
  );
}

function hasKeyword(haystack: string, terms: string[]): boolean {
  return terms.some((t) => haystack.includes(t.toLowerCase()));
}

export function inferRiskType(ai: AiAccountAnalysisLike): RiskType {
  const haystack = [
    ai.interpretation,
    ...(ai.problem_mails ?? []).flatMap((m) => [
      m.subject,
      m.matched_keywords,
      m.body,
    ]),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (hasKeyword(haystack, ['새 기기', '새 로그인', 'new device', 'new login']))
    return 'new_device_login';
  if (hasKeyword(haystack, ['비밀번호 재설정', 'password reset', 'recover']))
    return 'password_reset';
  if (
    hasKeyword(haystack, ['인증 코드', 'verification code', 'otp', '인증번호'])
  )
    return 'verification_code';
  if (hasKeyword(haystack, ['계정 복구', 'account recovery']))
    return 'account_recovery';
  if (hasKeyword(haystack, ['권한', 'permission', 'authorized app']))
    return 'permission_grant';
  return 'security_recommendation';
}

export function toHeadline(riskLevel: RiskLevel): string {
  if (riskLevel === 'high') return '오늘 안에 확인 필요';
  if (riskLevel === 'medium') return '확인이 필요해요';
  return '지켜보는 중이에요';
}
