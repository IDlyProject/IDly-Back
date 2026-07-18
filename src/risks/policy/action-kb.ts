export interface ActionKbEntry {
  stepType: string;
  priority: number;
  title: string;
  subtitle: string;
  why: string;
  tip?: string;
  help?: string;
  required: boolean;
  officialUrlKind: 'password' | 'security' | 'official' | null;
  cardNews?: {
    emoji: string;
    title: string;
    ctaLabel: string;
    url: string;
    badge?: '광고' | '카드뉴스';
  } | null;
  fallbackAdvice: { message: string; reasonCategory?: string }[];
}

export const ACTION_KB: Record<string, ActionKbEntry[]> = {
  new_device_login: [
    {
      stepType: 'change_password',
      priority: 0,
      title: '새 비밀번호로 변경',
      subtitle: '이전 조합과 겹치지 않는 비밀번호를 사용해요',
      why: '새 기기 로그인이 감지됐을 때 가장 먼저 해야 할 조치예요.',
      tip: '변경 완료 후 다시 돌아오시면, 나머지 조치도 도와드릴게요!',
      help: '설정 → 비밀번호(또는 보안) 순으로 이동 후 현재 비밀번호 입력, 새 비밀번호로 변경하세요. 아래 공식 링크로 바로 이동할 수 있어요!',
      required: true,
      officialUrlKind: 'password',
      cardNews: { emoji: '🔑', title: '비밀번호 하나 뚫리면 어디까지 털릴까?\n3분이면 끝나는 재사용 끊기', ctaLabel: '카드뉴스 ↗', url: 'https://idly.kr/tip/password-reuse', badge: '카드뉴스' },
      fallbackAdvice: [{ message: '설정에서 비밀번호 변경 메뉴를 찾기 어려우신가요? 공식 사이트 보안 설정 페이지로 이동하면 바로 보여요.' }],
    },
    {
      stepType: 'logout_sessions',
      priority: 1,
      title: '알 수 없는 기기 로그아웃',
      subtitle: '최근 로그인 기기 목록에서 모르는 기기를 제거해요',
      why: '의심 기기의 세션을 끊으면 진행 중인 불법 접근을 차단할 수 있어요.',
      tip: '완료하면 모든 보안 조치가 끝나요!',
      help: '설정 → 보안(또는 기기 관리) → 세션 또는 기기 목록에서 "모르는 기기 로그아웃" 버튼을 누르세요.',
      required: true,
      officialUrlKind: 'security',
      cardNews: { emoji: '🔒', title: '로그아웃만으로 충분할까?\n세션 보안 완벽 체크리스트', ctaLabel: '확인하기 ↗', url: 'https://idly.kr/tip/session-security', badge: '카드뉴스' },
      fallbackAdvice: [{ message: '세션 관리 메뉴를 못 찾으셨나요? 보안 설정 페이지에서 "활성 세션" 또는 "로그인된 기기" 항목을 확인해보세요.' }],
    },
    {
      stepType: 'enable_2fa',
      priority: 2,
      title: '2단계 인증 설정',
      subtitle: '추가 보안 계층 활성화',
      why: '2단계 인증이 켜져 있으면 비밀번호가 유출돼도 로그인을 막을 수 있어요.',
      tip: '완료하면 모든 보안 조치가 끝나요!',
      help: '설정 → 보안 및 계정 액세스 → 2단계 인증에서 SMS나 인증 앱 중 편한 방식으로 켜면 돼요.',
      required: false,
      officialUrlKind: 'security',
      cardNews: { emoji: '🛡️', title: 'Google Authenticator vs Authy\n내 상황엔 어떤 게 맞을까?', ctaLabel: '비교하기 ↗', url: 'https://idly.kr/tip/2fa-compare', badge: '카드뉴스' },
      fallbackAdvice: [{ message: '2단계 인증 메뉴가 없다면 "인증" 또는 "로그인 보안" 항목을 찾아보세요.' }],
    },
  ],

  password_reset: [
    {
      stepType: 'verify_activity',
      priority: 0,
      title: '재설정 요청이 본인 활동인지 확인',
      subtitle: '내가 요청한 게 아니라면 바로 비밀번호를 바꿔요',
      why: '내가 요청하지 않은 재설정 메일은 계정 탈취 시도일 수 있어요.',
      tip: '확인 후 바로 다음 조치로 넘어가요.',
      help: '최근 비밀번호 재설정 요청 메일이 왔다면 링크를 클릭하지 말고, 공식 사이트에서 직접 보안 상태를 확인하세요.',
      required: true,
      officialUrlKind: 'security',
      cardNews: null,
      fallbackAdvice: [{ message: '공식 사이트에서 직접 로그인해 "최근 활동" 또는 "보안 이벤트" 항목을 확인하세요.' }],
    },
    {
      stepType: 'change_password',
      priority: 1,
      title: '새 비밀번호로 변경',
      subtitle: '이전 조합과 겹치지 않는 비밀번호를 사용해요',
      why: '본인이 요청하지 않은 재설정이 감지됐다면 지금 당장 비밀번호를 바꾸는 게 가장 중요해요.',
      tip: '변경 후 나머지 조치도 같이 해요.',
      help: '설정 → 비밀번호 변경 페이지로 이동해 현재 비밀번호 입력 후 새 비밀번호로 바꾸세요.',
      required: true,
      officialUrlKind: 'password',
      cardNews: { emoji: '🔑', title: '비밀번호 하나 뚫리면 어디까지 털릴까?\n3분이면 끝나는 재사용 끊기', ctaLabel: '카드뉴스 ↗', url: 'https://idly.kr/tip/password-reuse', badge: '카드뉴스' },
      fallbackAdvice: [{ message: '비밀번호 변경 페이지가 보이지 않으면 공식 사이트 로그인 후 "계정 설정 → 보안"에서 찾아보세요.' }],
    },
    {
      stepType: 'check_recovery',
      priority: 2,
      title: '복구 이메일·전화번호 확인',
      subtitle: '내 정보로 설정되어 있는지 확인해요',
      why: '공격자가 복구 수단을 바꿨다면 계정을 영구적으로 잃을 수 있어요.',
      tip: '완료하면 모든 보안 조치가 끝나요!',
      help: '설정 → 보안 → 복구 이메일/전화번호 항목에서 내 것인지 확인하세요.',
      required: false,
      officialUrlKind: 'security',
      cardNews: null,
      fallbackAdvice: [{ message: '"계정 복구" 또는 "신뢰할 수 있는 연락처" 항목을 찾아 확인하세요.' }],
    },
  ],

  verification_code: [
    {
      stepType: 'verify_activity',
      priority: 0,
      title: '인증 코드 요청이 본인 활동인지 확인',
      subtitle: '내가 요청한 게 아니라면 무시하고 비밀번호를 바꿔요',
      why: '요청하지 않은 인증 코드 메일은 누군가 내 계정에 로그인을 시도하고 있다는 신호예요.',
      tip: '확인 후 바로 다음 조치로 넘어가요.',
      help: '요청하지 않은 인증 코드는 절대 공유하지 마세요. 공식 사이트에서 직접 최근 활동을 확인하세요.',
      required: true,
      officialUrlKind: 'security',
      cardNews: null,
      fallbackAdvice: [{ message: '최근 로그인 활동을 보안 설정 페이지에서 확인하세요.' }],
    },
    {
      stepType: 'change_password',
      priority: 1,
      title: '비밀번호 변경',
      subtitle: '의심스러운 시도가 있었다면 바로 바꿔요',
      why: '인증 코드 요청 시도가 반복된다면 비밀번호가 이미 노출됐을 가능성이 있어요.',
      tip: '완료하면 모든 보안 조치가 끝나요!',
      help: '설정 → 비밀번호 변경 페이지로 이동해 새 비밀번호로 바꾸세요.',
      required: true,
      officialUrlKind: 'password',
      cardNews: { emoji: '🔑', title: '비밀번호 하나 뚫리면 어디까지 털릴까?\n3분이면 끝나는 재사용 끊기', ctaLabel: '카드뉴스 ↗', url: 'https://idly.kr/tip/password-reuse', badge: '카드뉴스' },
      fallbackAdvice: [{ message: '비밀번호 변경 후 2단계 인증도 함께 설정하면 더 안전해요.' }],
    },
  ],

  account_recovery: [
    {
      stepType: 'verify_activity',
      priority: 0,
      title: '복구 요청이 본인 활동인지 확인',
      subtitle: '내가 요청한 게 아니라면 즉시 비밀번호를 바꿔요',
      why: '내가 요청하지 않은 계정 복구 시도는 탈취 시도의 신호예요.',
      tip: '확인 후 바로 다음 조치로 넘어가요.',
      help: '최근 계정 복구 이메일이 왔다면 링크를 클릭하지 말고, 공식 사이트에서 직접 보안 상태를 확인하세요.',
      required: true,
      officialUrlKind: 'security',
      cardNews: null,
      fallbackAdvice: [{ message: '공식 사이트에서 직접 로그인해 "최근 활동" 또는 "보안 이벤트"를 확인하세요.' }],
    },
    {
      stepType: 'change_password',
      priority: 1,
      title: '새 비밀번호로 변경',
      subtitle: '이전 조합과 겹치지 않는 비밀번호를 사용해요',
      why: '계정 복구 시도가 감지됐다면 비밀번호 변경이 가장 시급해요.',
      tip: '변경 후 나머지 조치도 같이 해요.',
      help: '설정 → 비밀번호 변경 페이지에서 새 비밀번호로 바꾸세요.',
      required: true,
      officialUrlKind: 'password',
      cardNews: { emoji: '🔑', title: '비밀번호 하나 뚫리면 어디까지 털릴까?\n3분이면 끝나는 재사용 끊기', ctaLabel: '카드뉴스 ↗', url: 'https://idly.kr/tip/password-reuse', badge: '카드뉴스' },
      fallbackAdvice: [{ message: '비밀번호 변경 페이지가 보이지 않으면 공식 사이트 보안 설정에서 찾아보세요.' }],
    },
    {
      stepType: 'check_recovery',
      priority: 2,
      title: '복구 이메일·전화번호 재설정',
      subtitle: '내 정보로 다시 설정해요',
      why: '공격자가 복구 수단을 바꿨다면 다시 잠길 수 있어요.',
      tip: '완료하면 모든 보안 조치가 끝나요!',
      help: '설정 → 보안 → 복구 정보에서 내 이메일·전화번호인지 확인하고 수정하세요.',
      required: false,
      officialUrlKind: 'security',
      cardNews: null,
      fallbackAdvice: [{ message: '"신뢰할 수 있는 연락처" 또는 "복구 옵션" 메뉴를 찾아 확인하세요.' }],
    },
  ],

  permission_grant: [
    {
      stepType: 'review_apps',
      priority: 0,
      title: '연결된 앱·권한 목록 확인',
      subtitle: '모르는 앱이 있으면 권한을 해제해요',
      why: '모르는 앱이 계정 권한을 갖고 있으면 데이터가 지속적으로 노출될 수 있어요.',
      tip: '확인 후 바로 다음 조치로 넘어가요.',
      help: '설정 → 보안 → 연결된 앱(또는 권한을 부여한 앱)에서 모르는 앱을 찾아보세요.',
      required: true,
      officialUrlKind: 'security',
      cardNews: null,
      fallbackAdvice: [{ message: '"타사 앱" 또는 "연동된 서비스" 메뉴를 찾아 모르는 앱이 있는지 확인하세요.' }],
    },
    {
      stepType: 'revoke_app_access',
      priority: 1,
      title: '모르는 앱 권한 해제',
      subtitle: '사용하지 않거나 모르는 앱은 바로 해제해요',
      why: '권한을 해제하면 해당 앱이 더 이상 계정 데이터에 접근할 수 없어요.',
      tip: '변경 완료 후 다시 돌아오시면, 나머지 조치도 도와드릴게요!',
      help: '앱 목록에서 모르는 앱 또는 오래된 앱 옆의 "액세스 권한 삭제" 또는 "연결 해제"를 누르세요.',
      required: true,
      officialUrlKind: 'security',
      cardNews: null,
      fallbackAdvice: [{ message: '특정 앱이 연결 해제되지 않으면 비밀번호를 변경하면 기존 OAuth 토큰이 만료돼요.' }],
    },
    {
      stepType: 'change_password',
      priority: 2,
      title: '비밀번호 변경',
      subtitle: '의심스러운 접근이 있었다면 비밀번호도 바꿔요',
      why: '권한 부여와 함께 비밀번호도 노출됐을 수 있어요.',
      tip: '완료하면 모든 보안 조치가 끝나요!',
      help: '설정 → 비밀번호 변경 페이지에서 새 비밀번호로 바꾸세요.',
      required: false,
      officialUrlKind: 'password',
      cardNews: null,
      fallbackAdvice: [{ message: '비밀번호 변경 후 연결된 앱 목록을 다시 한번 확인해보세요.' }],
    },
  ],

  security_recommendation: [
    {
      stepType: 'security_review',
      priority: 0,
      title: '보안 알림 확인',
      subtitle: '공식 사이트에서 직접 보안 상태를 확인해요',
      why: '보안 알림이 왔다면 공식 사이트에서 직접 원인을 확인하는 게 가장 정확해요.',
      tip: '확인 후 이상 없으면 다음 조치로 넘어가요.',
      help: '메일 링크는 누르지 말고 공식 사이트에 직접 접속해 보안 대시보드를 확인하세요.',
      required: false,
      officialUrlKind: 'security',
      cardNews: null,
      fallbackAdvice: [{ message: '보안 페이지를 못 찾겠다면 공식 사이트 → 설정 → 보안 순으로 이동하세요.' }],
    },
    {
      stepType: 'enable_2fa',
      priority: 1,
      title: '2단계 인증 설정 확인',
      subtitle: '2단계 인증이 켜져 있는지 확인해요',
      why: '2단계 인증이 없으면 비밀번호만으로 계정에 접근할 수 있어요.',
      tip: '완료하면 모든 보안 조치가 끝나요!',
      help: '설정 → 보안 → 2단계 인증(또는 2FA) 항목에서 활성화 여부를 확인하세요.',
      required: false,
      officialUrlKind: 'security',
      cardNews: { emoji: '🛡️', title: '2단계 인증, 어떻게 설정하나요?\n5분이면 충분한 설정 가이드', ctaLabel: '가이드 ↗', url: 'https://idly.kr/tip/2fa-guide', badge: '카드뉴스' },
      fallbackAdvice: [{ message: '"인증 앱" 또는 "로그인 보안" 항목에서 2단계 인증을 찾아보세요.' }],
    },
  ],
};

export function resolveKbUrl(
  registry: { officialUrl?: string; passwordUrl?: string; securityUrl?: string } | null,
  kind: 'password' | 'security' | 'official' | null,
): string | null {
  if (!registry || !kind) return null;
  if (kind === 'password') return registry.passwordUrl ?? registry.officialUrl ?? null;
  if (kind === 'security') return registry.securityUrl ?? registry.officialUrl ?? null;
  return registry.officialUrl ?? null;
}

export function getKbSteps(riskType: string | null): ActionKbEntry[] {
  return ACTION_KB[riskType ?? ''] ?? ACTION_KB['security_recommendation'] ?? [];
}
