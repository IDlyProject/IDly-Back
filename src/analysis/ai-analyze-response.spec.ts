import {
  isEmptyAiAnalyzeResult,
  parseAiAnalyzeResponse,
  sanitizeAiInterpretation,
} from './ai-analyze-response';

describe('parseAiAnalyzeResponse', () => {
  it('accepts a normal AI payload', () => {
    const out = parseAiAnalyzeResponse({
      accounts: [
        {
          account: 'Twitter',
          security_level: '위험',
          security_score: 8,
          problem_mails: [{ subject: 'New login' }],
        },
      ],
    });
    expect(out.accounts).toHaveLength(1);
    expect(out.accounts?.[0].account).toBe('Twitter');
    expect(out.accounts?.[0].problem_mails?.[0].subject).toBe('New login');
  });

  it('coerces string security_score and camelCase aliases', () => {
    const out = parseAiAnalyzeResponse({
      accounts: [
        {
          accountId: 'tw-1',
          account: 'Twitter',
          securityLevel: '주의',
          securityScore: '7.5',
          problemMails: [{ subject: 'Alert', matchedKeywords: 'login' }],
        },
      ],
    });
    expect(out.accounts?.[0].account_id).toBe('tw-1');
    expect(out.accounts?.[0].security_level).toBe('주의');
    expect(out.accounts?.[0].security_score).toBe(7.5);
    expect(out.accounts?.[0].problem_mails?.[0].matched_keywords).toBe('login');
  });

  it('sanitizes interpretation length and unsafe chars', () => {
    const out = parseAiAnalyzeResponse({
      accounts: [
        {
          account: 'X',
          interpretation: '위험 <script> 감지 ' + '가'.repeat(1200),
        },
      ],
    });
    const text = out.accounts?.[0].interpretation ?? '';
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
    expect(text.length).toBeLessThanOrEqual(1000);
  });

  it('treats missing accounts as empty list', () => {
    expect(parseAiAnalyzeResponse({})).toEqual({ accounts: [] });
    expect(isEmptyAiAnalyzeResult({ accounts: [] })).toBe(true);
  });

  it('rejects non-object root', () => {
    expect(() => parseAiAnalyzeResponse(null)).toThrow(/not an object/);
    expect(() => parseAiAnalyzeResponse('x')).toThrow(/not an object/);
  });

  it('rejects invalid accounts type', () => {
    expect(() => parseAiAnalyzeResponse({ accounts: 'bad' })).toThrow(
      /not an array/,
    );
  });

  it('rejects invalid account entries', () => {
    expect(() => parseAiAnalyzeResponse({ accounts: [1, 2] })).toThrow(
      /invalid/,
    );
  });
});

describe('sanitizeAiInterpretation', () => {
  it('returns undefined for blank', () => {
    expect(sanitizeAiInterpretation('   ')).toBeUndefined();
  });
});
