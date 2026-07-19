/**
 * AI /analyze 응답 내부 검증.
 * 실패 시 throw — 호출 측은 기존과 같이 run failed 경로로 처리 (API 스키마 불변).
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

    if (typeof row.account_id === 'string') account.account_id = row.account_id;
    if (typeof row.account === 'string') account.account = row.account;
    if (typeof row.security_level === 'string')
      account.security_level = row.security_level;
    if (typeof row.interpretation === 'string')
      account.interpretation = row.interpretation;
    if (typeof row.security_score === 'number' && Number.isFinite(row.security_score))
      account.security_score = row.security_score;

    if (row.problem_mails != null) {
      if (!Array.isArray(row.problem_mails)) {
        throw new Error('AI response problem_mails is not an array');
      }
      account.problem_mails = row.problem_mails
        .filter((m) => m != null && typeof m === 'object' && !Array.isArray(m))
        .map((m) => {
          const mail = m as Record<string, unknown>;
          const out: AiProblemMail = {};
          if (typeof mail.subject === 'string') out.subject = mail.subject;
          if (typeof mail.date === 'string') out.date = mail.date;
          if (typeof mail.body === 'string') out.body = mail.body;
          if (typeof mail.matched_keywords === 'string')
            out.matched_keywords = mail.matched_keywords;
          return out;
        });
    }

    accounts.push(account);
  }

  return { accounts };
}
