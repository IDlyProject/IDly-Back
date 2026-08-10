import type { GmailHistoryDelta } from './gmail-api.adapter';

/**
 * Gmail fetch와 AI/도메인 merge 사이의 명시적 경계.
 * 이번 P0 단계에서는 구현체를 등록하거나 scheduler에서 호출하지 않는다.
 */
export interface GmailIncrementalProcessor {
  process(input: {
    gmailAccountId: string;
    jobId: string;
    expectedHistoryId: string | null;
    delta: GmailHistoryDelta;
  }): Promise<void>;
}

export const GMAIL_INCREMENTAL_PROCESSOR = Symbol(
  'GMAIL_INCREMENTAL_PROCESSOR',
);
