/**
 * Action assistant 메시지 type 상수 (문서·검증용).
 * API 허용 값은 컨트롤러 DTO와 동일 — 여기서 바꾸면 FE 계약에 영향.
 */

export const ACTION_SESSION_CLIENT_MESSAGE_TYPES = [
  'action_select',
  'feedback',
  'failure_reason',
] as const;

export type ActionSessionClientMessageType =
  (typeof ACTION_SESSION_CLIENT_MESSAGE_TYPES)[number];

export const ACTION_SESSION_PHASE1_UNSUPPORTED_TYPES = ['user_text'] as const;

export function isSupportedActionSessionClientType(
  type: string,
): type is ActionSessionClientMessageType {
  return (ACTION_SESSION_CLIENT_MESSAGE_TYPES as readonly string[]).includes(
    type,
  );
}
