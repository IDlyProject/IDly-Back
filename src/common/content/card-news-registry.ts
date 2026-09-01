export interface CardNewsEntry {
  id: string;
  emoji: string;
  title: string;
  ctaLabel: string;
  url: string;
  source: 'instagram' | 'tistory';
  badge: '카드뉴스';
  /** stepType 또는 riskType 값과 매칭되는 주제 태그 */
  topics: string[];
}

export const CARD_NEWS_REGISTRY: CardNewsEntry[] = [
  // ── Tistory ─────────────────────────────────────────────────────────────────
  {
    id: 'tistory_3',
    emoji: '🔑',
    title: '비밀번호 하나 뚫리면 어디까지 털릴까?',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://idly-apt.tistory.com/3',
    source: 'tistory',
    badge: '카드뉴스',
    topics: ['change_password', 'new_device_login', 'password_reset', 'verification_code', 'account_recovery'],
  },
  {
    id: 'tistory_2',
    emoji: '🔒',
    title: '계정 반복 해킹, 비밀번호만 바꾸면 충분할까?',
    ctaLabel: '확인하기 ↗',
    url: 'https://idly-apt.tistory.com/2',
    source: 'tistory',
    badge: '카드뉴스',
    topics: ['logout_sessions', 'check_recovery', 'new_device_login'],
  },
  {
    id: 'tistory_5',
    emoji: '🛡️',
    title: 'PASS 앱만 쓰면 내 계정 안전할까? 본인인증 vs 2차 인증',
    ctaLabel: '가이드 ↗',
    url: 'https://idly-apt.tistory.com/5',
    source: 'tistory',
    badge: '카드뉴스',
    topics: ['enable_2fa', 'security_recommendation', 'security_review'],
  },
  {
    id: 'tistory_4',
    emoji: '🚨',
    title: '"계정 일시 중단" 진짜 vs 가짜, 1초 만에 구별하는 법',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://idly-apt.tistory.com/4',
    source: 'tistory',
    badge: '카드뉴스',
    topics: ['verify_activity', 'account_recovery', 'verification_code', 'password_reset'],
  },
  {
    id: 'tistory_6',
    emoji: '👻',
    title: '유령 계정이 개인정보를 털어가는 방법',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://idly-apt.tistory.com/6',
    source: 'tistory',
    badge: '카드뉴스',
    topics: ['review_apps', 'revoke_app_access', 'permission_grant', 'verify_activity'],
  },
  {
    id: 'tistory_8',
    emoji: '🏠',
    title: '10년 전 가입한 사이트, 아직도 방치하고 계신가요?',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://idly-apt.tistory.com/8',
    source: 'tistory',
    badge: '카드뉴스',
    topics: ['review_apps', 'revoke_app_access', 'permission_grant'],
  },
  {
    id: 'tistory_7',
    emoji: '✉️',
    title: '일잘러들의 메일함엔 이것이 없습니다',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://idly-apt.tistory.com/7',
    source: 'tistory',
    badge: '카드뉴스',
    topics: ['security_review', 'security_recommendation'],
  },
  {
    id: 'tistory_9',
    emoji: '🔐',
    title: '내 계정 안전 점수 MBTI 테스트 — 혹시 내 계정도 해커의 밥상?',
    ctaLabel: '테스트하기 ↗',
    url: 'https://idly-apt.tistory.com/9',
    source: 'tistory',
    badge: '카드뉴스',
    topics: ['security_review', 'security_recommendation', 'change_password', 'enable_2fa'],
  },
  // ── Instagram ────────────────────────────────────────────────────────────────
  {
    id: 'ig_dormant_kisa',
    emoji: '🏠',
    title: '10년 전 가입한 사이트, 아직도 방치하고 계신가요?',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://www.instagram.com/idly__apt/p/Db-kHPskpk5/',
    source: 'instagram',
    badge: '카드뉴스',
    topics: ['review_apps', 'revoke_app_access', 'permission_grant'],
  },
  {
    id: 'ig_ghost',
    emoji: '👻',
    title: '내가 이 사이트에도 가입했었다고?',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://www.instagram.com/idly__apt/p/DburytVklqt/',
    source: 'instagram',
    badge: '카드뉴스',
    topics: ['review_apps', 'revoke_app_access', 'permission_grant', 'security_review'],
  },
  {
    id: 'ig_pass_vs_2fa',
    emoji: '🛡️',
    title: 'PASS 앱 vs OTP 인증 앱, 내 상황엔 어떤 게 맞을까?',
    ctaLabel: '비교하기 ↗',
    url: 'https://www.instagram.com/idly__apt/p/DbnMBS_EmTw/',
    source: 'instagram',
    badge: '카드뉴스',
    topics: ['enable_2fa', 'security_recommendation'],
  },
  {
    id: 'ig_phishing',
    emoji: '🚨',
    title: '"계정 일시 중단" 피싱 메일, 3초 만에 구별하는 법',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://www.instagram.com/idly__apt/p/DbaabpSEqKQ/',
    source: 'instagram',
    badge: '카드뉴스',
    topics: ['verify_activity', 'account_recovery', 'verification_code'],
  },
  {
    id: 'ig_inbox',
    emoji: '✉️',
    title: '일잘러들의 메일함엔 이것이 없습니다',
    ctaLabel: '카드뉴스 ↗',
    url: 'https://www.instagram.com/idly__apt/p/Db4w9xBkluA/',
    source: 'instagram',
    badge: '카드뉴스',
    topics: ['security_review', 'security_recommendation'],
  },
  {
    id: 'ig_mbti',
    emoji: '🔐',
    title: '혹시 내 계정도 해커의 밥상? 계정 안전 점수 MBTI 테스트',
    ctaLabel: '테스트하기 ↗',
    url: 'https://www.instagram.com/idly__apt/p/DcFzPy9EgyS/',
    source: 'instagram',
    badge: '카드뉴스',
    topics: ['security_review', 'security_recommendation', 'change_password', 'enable_2fa'],
  },
];

/**
 * stepType > riskType 순으로 점수를 매겨 가장 관련성 높은 카드뉴스를 반환한다.
 * exclude 목록에 있는 id는 건너뛴다.
 */
export function resolveCardNews(
  stepType: string | null,
  riskType: string | null,
  opts: { exclude?: string[]; preferSource?: 'instagram' | 'tistory' } = {},
): CardNewsEntry | null {
  const { exclude = [], preferSource } = opts;

  const scored = CARD_NEWS_REGISTRY
    .filter((e) => !exclude.includes(e.id))
    .map((e) => {
      let score = 0;
      if (stepType && e.topics.includes(stepType)) score += 2;
      if (riskType && e.topics.includes(riskType)) score += 1;
      if (preferSource && e.source === preferSource) score += 0.5;
      return { entry: e, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.entry ?? null;
}

/**
 * 홈 화면용 — 비밀번호·방치계정·2FA 세 주제 클러스터에서 각 1개씩 픽한다.
 */
export function resolveHomeCardNews(): Pick<CardNewsEntry, 'id' | 'emoji' | 'title' | 'url'>[] {
  const clusters: [string, 'instagram' | 'tistory'][] = [
    ['change_password', 'tistory'],
    ['review_apps',     'instagram'],
    ['enable_2fa',      'instagram'],
  ];
  const used: string[] = [];
  const result: Pick<CardNewsEntry, 'id' | 'emoji' | 'title' | 'url'>[] = [];

  for (const [topic, preferSource] of clusters) {
    const pick = resolveCardNews(topic, null, { exclude: used, preferSource });
    if (pick) {
      result.push({ id: pick.id, emoji: pick.emoji, title: pick.title, url: pick.url });
      used.push(pick.id);
    }
  }
  return result;
}
