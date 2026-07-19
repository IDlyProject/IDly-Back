import {
  ACTION_SESSION_CLIENT_MESSAGE_TYPES,
  isSupportedActionSessionClientType,
} from './action-message-types';

describe('action-message-types', () => {
  it('lists phase1 client types', () => {
    expect(ACTION_SESSION_CLIENT_MESSAGE_TYPES).toEqual([
      'action_select',
      'feedback',
      'failure_reason',
    ]);
  });

  it('rejects free-text phase2 type', () => {
    expect(isSupportedActionSessionClientType('user_text')).toBe(false);
    expect(isSupportedActionSessionClientType('feedback')).toBe(true);
  });
});
