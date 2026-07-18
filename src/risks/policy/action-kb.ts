import { resolveService } from '../../common/registry/service-registry';

export interface ActionKbEntry {
  stepType: string;
  priority: number;
  title: string;
  subtitle: string;
  why: string;
  tip?: string;
  /** 서비스 비의존 기본 안내 — 특정 브랜드 나열 금지 */
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

/**
 * stepType × 정규화 서비스키 → 짧은 메뉴 경로.
 * help 본문에는 넣지 않고, resolveStepHelp()가 **현재 서비스 1개만** 덧붙인다.
 * (서비스 키는 normalizeServiceKey / SERVICE_REGISTRY.serviceName과 맞춤)
 */
const SERVICE_STEP_PATHS: Record<string, Record<string, string>> = {
  change_password: {
    Google: 'myaccount.google.com → 보안 → 비밀번호',
    Gmail: 'myaccount.google.com → 보안 → 비밀번호',
    YouTube: 'Google 계정 → 보안 → 비밀번호',
    Amazon: '계정 → 로그인 및 보안 → 비밀번호',
    Twitter: '설정 → 계정 → 비밀번호',
    X: '설정 → 계정 → 비밀번호',
    Kakao: '카카오계정 → 계정 정보 → 비밀번호',
    Naver: '네이버ID → 보안설정 → 비밀번호',
    Netflix: '계정 → 비밀번호 변경',
    Microsoft: 'account.microsoft.com → 보안 → 비밀번호 변경',
    Apple: 'appleid.apple.com → 로그인 및 보안 → 비밀번호',
    Discord: '사용자 설정 → 내 계정 → 비밀번호 변경',
    Notion: 'Settings & members → My account → Account security',
    Slack: '프로필 → 계정 설정 → 비밀번호',
    GitHub: 'Settings → Password and authentication',
    Instagram: '설정 → 계정 센터 → 비밀번호',
    Facebook: '설정 및 개인정보 → 비밀번호 및 보안',
    LinkedIn: '설정 → 로그인 및 보안 → 비밀번호 변경',
    Spotify: '계정 개요 → 비밀번호 변경',
    Steam: '계정 세부 정보 → 비밀번호 변경',
    Coupang: '마이쿠팡 → 회원정보 수정 → 비밀번호',
    사람인: '회원정보 관리 → 비밀번호 변경',
    PayPal: '설정 → 보안 → 비밀번호',
    Dropbox: '설정 → 보안 → 비밀번호',
    Zoom: '프로필 → 비밀번호',
    Twitch: '설정 → 보안 및 개인정보',
    Reddit: 'User Settings → Account → password',
  },
  logout_sessions: {
    Google: 'myaccount.google.com → 보안 → 기기 관리',
    Gmail: 'myaccount.google.com → 보안 → 기기 관리',
    Amazon: '계정 → 로그인 및 보안 → 활성 웹사이트',
    Twitter: '설정 → 보안 및 계정 액세스 → 앱 및 세션',
    X: '설정 → 보안 및 계정 액세스 → 앱 및 세션',
    Netflix: '계정 → 모든 기기에서 로그아웃',
    Discord: '사용자 설정 → 기기 → 모든 기기에서 로그아웃',
    Notion: 'Settings → My account → Devices / sessions',
    Slack: '계정 설정 → 세션 → 다른 세션 로그아웃',
    GitHub: 'Settings → Sessions',
    Microsoft: 'account.microsoft.com → 보안 → 로그인 활동',
    Apple: 'appleid.apple.com → 기기',
    Instagram: '로그인 활동 → 로그아웃',
    Facebook: '설정 → 보안 → 로그인 위치',
    Spotify: '계정 개요 → 로그아웃 모든 기기',
    Steam: '계정 → 보안 → 승인된 기기',
  },
  enable_2fa: {
    Google: 'myaccount.google.com → 보안 → 2단계 인증',
    Gmail: 'myaccount.google.com → 보안 → 2단계 인증',
    Twitter: '설정 → 보안 → 이중 인증',
    X: '설정 → 보안 → 이중 인증',
    Kakao: '카카오계정 → 보안 → 2단계 인증',
    Naver: '네이버ID → 보안설정 → 2단계 인증',
    Discord: '사용자 설정 → 내 계정 → 이중 인증',
    GitHub: 'Settings → Password and authentication → 2FA',
    Microsoft: 'account.microsoft.com → 보안 → 추가 보안',
    Apple: 'appleid.apple.com → 로그인 및 보안 → 2단계 확인',
    Notion: 'Settings → My account → 2-step verification',
    Slack: '계정 설정 → 2단계 인증',
    Instagram: '설정 → 계정 센터 → 2단계 인증',
    Facebook: '설정 → 비밀번호 및 보안 → 2단계 인증',
    Steam: 'Steam Guard → 모바일 인증기',
    Twitch: '설정 → 보안 → 2단계 인증',
  },
  verify_activity: {
    Google: 'myaccount.google.com → 보안 → 최근 보안 활동',
    Gmail: 'myaccount.google.com → 보안 → 최근 보안 활동',
    Amazon: '계정 → 로그인 및 보안 → 최근 활동',
    Twitter: '설정 → 앱 및 세션 → 계정 액세스 기록',
    X: '설정 → 앱 및 세션 → 계정 액세스 기록',
    Discord: '사용자 설정 → 기기 / 승인된 앱',
    Microsoft: 'account.microsoft.com → 보안 → 로그인 활동',
    GitHub: 'Settings → Security log',
    Instagram: '로그인 활동',
    Facebook: '설정 → 보안 → 로그인 위치',
    Notion: 'Settings → My account → Devices',
  },
  check_recovery: {
    Google: 'myaccount.google.com → 개인 정보 → 복구 연락처',
    Gmail: 'myaccount.google.com → 개인 정보 → 복구 연락처',
    Amazon: '계정 → 로그인 및 보안 → 복구 수단',
    Twitter: '설정 → 계정 → 이메일·전화번호',
    X: '설정 → 계정 → 이메일·전화번호',
    Microsoft: 'account.microsoft.com → 보안 → 고급 보안 옵션',
    Apple: 'appleid.apple.com → 로그인 및 보안 → 계정 복구',
    Naver: '네이버ID → 보안설정 → 연락처',
    Kakao: '카카오계정 → 계정 정보 → 연락처',
  },
  review_apps: {
    Google: 'myaccount.google.com → 보안 → 서드파티 액세스',
    Gmail: 'myaccount.google.com → 보안 → 서드파티 액세스',
    Twitter: '설정 → 앱 및 세션 → 연결된 앱',
    X: '설정 → 앱 및 세션 → 연결된 앱',
    Kakao: '카카오계정 → 연결된 서비스',
    Discord: '사용자 설정 → 승인된 앱',
    GitHub: 'Settings → Applications → Authorized OAuth Apps',
    Microsoft: 'account.microsoft.com → 개인정보 → 앱 액세스',
    Slack: '계정 설정 → 연결된 계정',
    Notion: 'Settings → My connections',
    Facebook: '설정 → 앱 및 웹사이트',
    Instagram: '설정 → 앱 및 웹사이트',
  },
  revoke_app_access: {
    Google: '서드파티 액세스 → 앱 선택 → 액세스 삭제',
    Gmail: '서드파티 액세스 → 앱 선택 → 액세스 삭제',
    Twitter: '연결된 앱 → 앱 권한 취소',
    X: '연결된 앱 → 앱 권한 취소',
    Kakao: '연결된 서비스 → 연결 끊기',
    Discord: '승인된 앱 → 인증 해제',
    GitHub: 'Authorized OAuth Apps → Revoke',
    Facebook: '앱 및 웹사이트 → 제거',
    Slack: '연결된 계정 → 연결 해제',
  },
  security_review: {
    Google: 'myaccount.google.com → 보안 → 보안 진단',
    Gmail: 'myaccount.google.com → 보안 → 보안 진단',
    사람인: '마이페이지 → 계정 설정 → 보안/로그인 기록',
    Saramin: '마이페이지 → 계정 설정 → 보안/로그인 기록',
    Microsoft: 'account.microsoft.com → 보안',
    Apple: 'appleid.apple.com → 로그인 및 보안',
    Discord: '사용자 설정 → 내 계정 / 기기',
    GitHub: 'Settings → Security log',
    Naver: '네이버ID → 보안설정',
    Kakao: '카카오계정 → 보안',
  },
};

export const ACTION_KB: Record<string, ActionKbEntry[]> = {
  new_device_login: [
    {
      stepType: 'change_password',
      priority: 0,
      title: '새 비밀번호로 변경',
      subtitle: '이전 조합과 겹치지 않는 비밀번호를 사용해요',
      why: '새 기기 로그인이 감지됐을 때 가장 먼저 해야 할 조치예요.',
      tip: '변경 완료 후 다시 돌아오시면, 나머지 조치도 도와드릴게요!',
      help: '공식 사이트 설정에서 비밀번호 변경 메뉴로 이동한 뒤, 현재 비밀번호를 입력하고 새 비밀번호로 바꾸세요. 메일 속 링크는 누르지 마세요.',
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
      help: '보안·기기 관리(또는 활성 세션) 메뉴에서 모르는 기기를 찾아 로그아웃하세요.',
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
      help: '보안 설정에서 2단계 인증(또는 이중 인증)을 켠 뒤, SMS나 인증 앱 중 편한 방식을 선택하세요.',
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
      help: '최근 비밀번호 재설정 요청 메일이 왔다면 링크를 클릭하지 말고, 공식 사이트에 직접 접속해 최근 보안 활동을 확인하세요.',
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
      help: '계정 보안 설정에서 복구 이메일·전화번호가 내 연락처인지 확인하세요.',
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
      help: '요청하지 않은 인증 코드는 절대 공유하지 마세요. 공식 사이트에서 최근 로그인 활동을 직접 확인하세요.',
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
      help: '설정에서 비밀번호를 변경하세요. 변경 후 2단계 인증도 함께 켜 두면 더 안전해요.',
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
      help: '공식 사이트에 직접 로그인해 최근 보안 활동·복구 요청 이력을 확인하세요. 메일 링크는 누르지 마세요.',
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
      help: '설정 → 비밀번호 변경에서 새 비밀번호로 바꾸세요.',
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
      help: '복구 이메일·전화번호를 내 연락처로 다시 설정하세요.',
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
      help: '설정에서 연결된 앱·서드파티 액세스 목록을 열어 모르는 앱이 있는지 확인하세요.',
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
      help: '목록에서 모르는 앱을 선택한 뒤 액세스 삭제(또는 연결 끊기)를 누르세요.',
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
      help: '비밀번호를 변경한 뒤 연결된 앱 목록을 다시 한 번 확인하세요.',
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
      help: '메일 링크는 누르지 말고 공식 사이트에 직접 접속해 보안 대시보드·로그인 기록을 확인하세요.',
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
      help: '보안 설정에서 2단계 인증이 켜져 있는지 확인하고, 꺼져 있다면 활성화하세요.',
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

/** displayName / serviceName → SERVICE_STEP_PATHS 키 (service-registry를 단일 진실 출처로 사용) */
export function normalizeServiceKey(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const hit = resolveService(name);
  return hit.fromRegistry ? hit.serviceName : name.trim();
}

/**
 * 현재 서비스 1개 기준 help 조립.
 * - 기본 문장(브랜드 비의존)
 * - 알면 해당 서비스 경로만 1줄 추가
 * - 공식 URL 없으면 “직접 접속” 안내 추가
 */
export function resolveStepHelp(
  entry: ActionKbEntry,
  opts: {
    displayName?: string | null;
    hasOfficialUrl?: boolean;
  } = {},
): string {
  const base =
    entry.help?.trim() ||
    entry.fallbackAdvice?.[0]?.message ||
    '공식 사이트 보안 설정에서 해당 조치를 진행해 보세요.';

  const display = opts.displayName?.trim() || null;
  const key = normalizeServiceKey(display);
  const path = key ? SERVICE_STEP_PATHS[entry.stepType]?.[key] : undefined;

  let text = base;
  if (path && display) {
    text = `${base} ${display}에서는 「${path}」 경로로 이동할 수 있어요.`;
  } else if (!opts.hasOfficialUrl && display) {
    text = `${base} ${display} 공식 사이트에 직접 로그인해 설정·보안 메뉴에서 「${entry.title}」을(를) 찾아주세요. 메일 속 링크는 누르지 마세요.`;
  }
  return text;
}

function normTitle(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/**
 * type 우선, 없으면 title/키워드로 KB 매칭 — unknown row·cold 데이터 일반화용
 */
export function matchKbEntry(
  riskType: string | null,
  item: { type?: string | null; title?: string | null },
): ActionKbEntry | null {
  const steps = getKbSteps(riskType);
  if (!steps.length) return null;

  if (item.type && item.type !== 'unknown') {
    const byType = steps.find((s) => s.stepType === item.type);
    if (byType) return byType;
    // type이 다른 riskType KB에만 있을 수 있음 — flat search
    const any = Object.values(ACTION_KB)
      .flat()
      .find((s) => s.stepType === item.type);
    if (any) return any;
  }

  const title = item.title ?? '';
  const t = normTitle(title);
  if (t) {
    for (const s of steps) {
      const kt = normTitle(s.title);
      if (t === kt || t.includes(kt) || kt.includes(t)) return s;
    }
  }

  if (/비밀번호|password/i.test(title)) {
    return steps.find((s) => s.stepType === 'change_password') ?? null;
  }
  if (/2단계|2fa|이중\s*인증/i.test(title)) {
    return steps.find((s) => s.stepType === 'enable_2fa') ?? null;
  }
  if (/기기|세션|로그아웃/i.test(title)) {
    return steps.find((s) => s.stepType === 'logout_sessions') ?? null;
  }
  if (/복구/i.test(title)) {
    return steps.find((s) => s.stepType === 'check_recovery') ?? null;
  }
  if (/앱|권한|연동/i.test(title)) {
    return (
      steps.find((s) => s.stepType === 'review_apps') ??
      steps.find((s) => s.stepType === 'revoke_app_access') ??
      null
    );
  }
  if (/보안\s*알림|보안\s*상태|보안\s*확인/i.test(title)) {
    return steps.find((s) => s.stepType === 'security_review') ?? null;
  }

  return null;
}

/** registry 밖·URL 없음일 때 official_link 대신 쓸 안내 문구 */
export function noOfficialLinkGuidance(displayName: string, actionTitle: string): string {
  return `${displayName} 공식 사이트에 직접 접속해 「${actionTitle}」 관련 메뉴를 찾아보세요. 메일·문자에 온 링크는 누르지 않는 편이 안전해요.`;
}

// ─── KB ↔ ActionItem merge plan (analysis / session bootstrap 공용) ───────────

export type MergeableActionItem = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  why: string | null;
  isRequired: boolean;
  externalUrl: string | null;
  order: number;
  status: string;
};

export type ActionItemMergePlan = {
  updates: {
    id: string;
    type: string;
    title: string;
    why: string | null;
    description: string | null;
    isRequired: boolean;
    externalUrl: string | null;
    order: number;
  }[];
  creates: {
    type: string;
    title: string;
    description: string | null;
    why: string | null;
    isRequired: boolean;
    externalUrl: string | null;
    order: number;
    status: 'pending';
  }[];
  skipIds: string[];
};

/**
 * riskType KB를 기준으로 기존 ActionItem을 보강/생성/스킵 계획.
 * unknown type은 title 매칭으로 claim.
 */
export function planKbActionMerge(
  existing: MergeableActionItem[],
  riskType: string | null,
  registry: { officialUrl?: string | null; passwordUrl?: string | null; securityUrl?: string | null } | null,
): ActionItemMergePlan {
  const kbSteps = getKbSteps(riskType);
  const claimed = new Set<string>();
  const updates: ActionItemMergePlan['updates'] = [];
  const creates: ActionItemMergePlan['creates'] = [];

  const byType = new Map<string, MergeableActionItem[]>();
  for (const a of existing) {
    const bucket = a.type && a.type !== 'unknown' ? a.type : '__unknown__';
    const list = byType.get(bucket) ?? [];
    list.push(a);
    byType.set(bucket, list);
  }

  const takeByType = (stepType: string): MergeableActionItem | null => {
    const list = byType.get(stepType);
    if (!list?.length) return null;
    const item = list.shift()!;
    claimed.add(item.id);
    return item;
  };

  const takeByTitle = (title: string): MergeableActionItem | null => {
    const unknown = byType.get('__unknown__') ?? [];
    const idx = unknown.findIndex((a) => {
      if (claimed.has(a.id)) return false;
      const matched = matchKbEntry(riskType, a);
      return matched?.title === title || normTitle(a.title) === normTitle(title);
    });
    if (idx < 0) {
      // broader: any unclaimed unknown that matchKbEntry maps to this step's title via keyword
      for (let i = 0; i < unknown.length; i++) {
        const a = unknown[i];
        if (claimed.has(a.id)) continue;
        const m = matchKbEntry(riskType, a);
        if (m && normTitle(m.title) === normTitle(title)) {
          claimed.add(a.id);
          unknown.splice(i, 1);
          return a;
        }
      }
      return null;
    }
    const [item] = unknown.splice(idx, 1);
    claimed.add(item.id);
    return item;
  };

  for (const [i, kb] of kbSteps.entries()) {
    const reg = registry
      ? {
          officialUrl: registry.officialUrl ?? undefined,
          passwordUrl: registry.passwordUrl ?? undefined,
          securityUrl: registry.securityUrl ?? undefined,
        }
      : null;
    const officialUrl = resolveKbUrl(reg, kb.officialUrlKind ?? null);

    let existingItem = takeByType(kb.stepType);
    if (!existingItem) existingItem = takeByTitle(kb.title);

    if (existingItem) {
      // done 상태는 status 유지, 메타만 보강
      updates.push({
        id: existingItem.id,
        type: kb.stepType,
        title: kb.title,
        why: kb.why ?? existingItem.why,
        description: existingItem.description ?? kb.subtitle ?? null,
        isRequired: kb.required,
        externalUrl: officialUrl ?? existingItem.externalUrl ?? null,
        order: i,
      });
    } else {
      creates.push({
        type: kb.stepType,
        title: kb.title,
        description: kb.subtitle ?? null,
        why: kb.why ?? null,
        isRequired: kb.required,
        externalUrl: officialUrl ?? null,
        order: i,
        status: 'pending',
      });
    }
  }

  const skipIds = existing
    .filter((a) => !claimed.has(a.id) && a.status !== 'done')
    .map((a) => a.id);

  return { updates, creates, skipIds };
}
