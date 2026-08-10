export class GmailHistoryCursorExpiredError extends Error {
  constructor(public readonly startHistoryId: string) {
    super('Gmail history cursor가 만료되어 전체 복구가 필요합니다.');
    this.name = 'GmailHistoryCursorExpiredError';
  }
}

export class GmailReconnectRequiredError extends Error {
  constructor(public readonly gmailAccountId: string) {
    super('Gmail 권한이 만료되었거나 취소되었습니다.');
    this.name = 'GmailReconnectRequiredError';
  }
}
