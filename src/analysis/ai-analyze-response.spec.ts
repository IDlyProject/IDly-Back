import { parseAiAnalyzeResponse } from './ai-analyze-response';

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

  it('treats missing accounts as empty list', () => {
    expect(parseAiAnalyzeResponse({})).toEqual({ accounts: [] });
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
