/**
 * 프론트가 보내는 라우트 경로(location.pathname)를 디스코드 제보에 표시할
 * 한글 화면명으로 변환한다. 매핑에 없는 경로는 원본 경로를 그대로 노출한다.
 */
const SCREEN_NAMES: Record<string, string> = {
  '/': '스플래시',
  '/auth/callback': '로그인 콜백',
  '/onboarding/login': '로그인',
  '/onboarding/consent': '약관 동의',
  '/onboarding/profile': '프로필 설정',
  '/onboarding/primary-complete': '대표 계정 완료',
  '/onboarding/add-mailboxes': '메일함 추가',
  '/onboarding/full-complete': '온보딩 완료',
  '/analyzing': '분석 중',
  '/home': '홈화면',
  '/security-assistant': '보안 도우미',
  '/my': '마이',
  '/my/account': '계정 관리',
  '/my/dormant': '휴면 계정',
  '/my/notification-settings': '알림 설정',
  '/my/withdraw': '탈퇴',
  '/my/withdraw/reason': '탈퇴 사유',
};

/** accountId가 경로에 박히는 동적 라우트 */
const DYNAMIC_SCREEN_NAMES: { pattern: RegExp; name: string }[] = [
  { pattern: /^\/account\/[^/]+\/action\/?$/, name: '조치 화면' },
  { pattern: /^\/account\/[^/]+\/?$/, name: '계정 상세' },
];

export function toScreenName(screenPath?: string | null): string {
  if (!screenPath) return '(미제공)';

  // 쿼리스트링·해시·끝 슬래시 제거
  const path = screenPath.split(/[?#]/)[0].replace(/(.+)\/$/, '$1');

  const exact = SCREEN_NAMES[path];
  if (exact) return exact;

  for (const { pattern, name } of DYNAMIC_SCREEN_NAMES) {
    if (pattern.test(path)) return name;
  }

  return screenPath;
}
