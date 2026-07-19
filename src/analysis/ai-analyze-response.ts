/**
 * AI /analyze 응답 내부 검증.
 * 실패 시 throw — 호출 측은 기존과 같이 run failed 경로로 처리 (API 스키마 불변).
 * FE는 이 객체를 직접 받지 않음 — saveResults → DB → home/detail 계약 필드만 노출.
 */

export interface AiProblemMail {
  subject?: string;
  date?: string;
  body?: string;
  matched_keywords?: string;
}

export interface AiAccountAnalysis {
  account_id?: string;
  account?: string;
  security_score?: number;
  security_level?: string;
  interpretation?: string;
  problem_mails?: AiProblemMail[];
}

export interface AiAnalyzeResponse {
  accounts?: AiAccountAnalysis[];
}

/** DB/FE 카드 텍스트 상한 (필드 존재 여부는 동일, 길이만 제한) */
export const AI_INTERPRETATION_MAX_LEN = 1000;

/**
 * AI interpretation 저장용 — 스키마 필드는 그대로, 길이·위험 문자만 정리.
 * HTML 태그를 제거하지 않고 <>` 만 공백 처리 (표시 깨짐 방지).
 */
export function sanitizeAiInterpretation(
  value: string | undefined,
  maxLen = AI_INTERPRETATION_MAX_LEN,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .replace(/[<>`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return undefined;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

function asFiniteScore(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/** snake_case 우선, camelCase 별칭 허용 (AI 스키마 drift 완화, FE 계약 무관) */
function pickAccountString(
  row: Record<string, unknown>,
  snake: string,
  camel: string,
): string | undefined {
  return asNonEmptyString(row[snake]) ?? asNonEmptyString(row[camel]);
}

export function parseAiAnalyzeResponse(data: unknown): AiAnalyzeResponse {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('AI response is not an object');
  }

  const root = data as Record<string, unknown>;
  if (!('accounts' in root)) {
    // 일부 레거시 응답: accounts 없이 빈 결과로 취급
    return { accounts: [] };
  }

  if (root.accounts == null) {
    return { accounts: [] };
  }

  if (!Array.isArray(root.accounts)) {
    throw new Error('AI response.accounts is not an array');
  }

  const accounts: AiAccountAnalysis[] = [];
  for (const item of root.accounts) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('AI response account entry is invalid');
    }
    const row = item as Record<string, unknown>;
    const account: AiAccountAnalysis = {};

    const accountId = pickAccountString(row, 'account_id', 'accountId');
    if (accountId) account.account_id = accountId;

    const accountName = asNonEmptyString(row.account);
    if (accountName) account.account = accountName;

    const level =
      asNonEmptyString(row.security_level) ??
      asNonEmptyString(row.securityLevel);
    if (level) account.security_level = level;

    const interpretation = sanitizeAiInterpretation(
      asNonEmptyString(row.interpretation),
    );
    if (interpretation) account.interpretation = interpretation;

    const score = asFiniteScore(
      row.security_score !== undefined ? row.security_score : row.securityScore,
    );
    if (score !== undefined) account.security_score = score;

    const mailsRaw =
      row.problem_mails !== undefined ? row.problem_mails : row.problemMails;
    if (mailsRaw != null) {
      if (!Array.isArray(mailsRaw)) {
        throw new Error('AI response problem_mails is not an array');
      }
      account.problem_mails = mailsRaw
        .filter((m) => m != null && typeof m === 'object' && !Array.isArray(m))
        .map((m) => {
          const mail = m as Record<string, unknown>;
          const out: AiProblemMail = {};
          const subject = asNonEmptyString(mail.subject);
          const date = asNonEmptyString(mail.date);
          const body = asNonEmptyString(mail.body);
          const keywords =
            asNonEmptyString(mail.matched_keywords) ??
            asNonEmptyString(mail.matchedKeywords);
          if (subject) out.subject = subject.slice(0, 500);
          if (date) out.date = date.slice(0, 64);
          // body는 evidence 저장에 쓰이지 않지만 위험 유형 추론에만 사용 — 길이 캡
          if (body) out.body = body.slice(0, 2000);
          if (keywords) out.matched_keywords = keywords.slice(0, 500);
          return out;
        });
    }

    accounts.push(account);
  }

  return { accounts };
}

export function isEmptyAiAnalyzeResult(result: AiAnalyzeResponse): boolean {
  return !result.accounts || result.accounts.length === 0;
}
