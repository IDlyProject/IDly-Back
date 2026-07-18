/**
 * 서비스별 공식 URL 플레이북.
 * - passwordUrl: 로그인 상태 비밀번호 변경(가능하면) / 없으면 보안 허브
 * - securityUrl: 2FA·세션·기기·앱 권한 등 보안 허브
 * - officialUrl: 계정 홈 폴백
 *
 * 원칙: 메일 속 딥링크가 아니라 공식 도메인 설정 페이지.
 * 로그인 필수 페이지는 비로그인 시 로그인 후 리다이렉트되는 것이 정상.
 */
export interface ServiceRegistryItem {
  serviceName: string;
  aliases: string[];
  domain: string;
  officialUrl: string;
  passwordUrl?: string;
  securityUrl?: string;
}

export const SERVICE_REGISTRY: ServiceRegistryItem[] = [
  // ── Global identity / mail ─────────────────────────────────────────────
  {
    serviceName: 'Google',
    aliases: ['google', '구글', 'gmail', 'gmail.com', 'youtube', '유튜브'],
    domain: 'google.com',
    officialUrl: 'https://myaccount.google.com',
    passwordUrl: 'https://myaccount.google.com/signinoptions/password',
    securityUrl: 'https://myaccount.google.com/security',
  },
  {
    serviceName: 'YouTube',
    aliases: ['youtube', '유튜브'],
    domain: 'youtube.com',
    officialUrl: 'https://www.youtube.com',
    passwordUrl: 'https://myaccount.google.com/signinoptions/password',
    securityUrl: 'https://myaccount.google.com/security',
  },
  {
    serviceName: 'Microsoft',
    aliases: [
      'microsoft',
      '마이크로소프트',
      'ms',
      'outlook',
      '아웃룩',
      'hotmail',
      'live.com',
      'office',
      'xbox',
    ],
    domain: 'microsoft.com',
    officialUrl: 'https://account.microsoft.com',
    passwordUrl: 'https://account.live.com/password/Change',
    securityUrl: 'https://account.microsoft.com/security',
  },
  {
    serviceName: 'Apple',
    aliases: ['apple', '애플', 'apple id', 'appleid', 'icloud', '아이클라우드'],
    domain: 'apple.com',
    officialUrl: 'https://appleid.apple.com',
    passwordUrl: 'https://appleid.apple.com/account/manage',
    securityUrl: 'https://appleid.apple.com/account/manage',
  },

  // ── Commerce ───────────────────────────────────────────────────────────
  {
    serviceName: 'Amazon',
    aliases: ['amazon', '아마존', 'aws'],
    domain: 'amazon.com',
    officialUrl: 'https://www.amazon.com',
    passwordUrl: 'https://www.amazon.com/gp/css/edit-password-entry',
    securityUrl: 'https://www.amazon.com/gp/css/homepage.html',
  },
  {
    serviceName: 'Coupang',
    aliases: ['coupang', '쿠팡'],
    domain: 'coupang.com',
    officialUrl: 'https://www.coupang.com',
    passwordUrl: 'https://login.coupang.com/login/accountInfoManage.pang',
    securityUrl: 'https://login.coupang.com/login/accountInfoManage.pang',
  },
  {
    serviceName: '11번가',
    aliases: ['11번가', '11st', 'elevenst'],
    domain: '11st.co.kr',
    officialUrl: 'https://www.11st.co.kr',
    passwordUrl: 'https://www.11st.co.kr/register/password',
    securityUrl: 'https://www.11st.co.kr/register/account',
  },
  {
    serviceName: 'Gmarket',
    aliases: ['gmarket', '지마켓'],
    domain: 'gmarket.co.kr',
    officialUrl: 'https://www.gmarket.co.kr',
    securityUrl: 'https://my.gmarket.co.kr',
  },

  // ── Social ─────────────────────────────────────────────────────────────
  {
    serviceName: 'Twitter',
    // 주의: alias 'x.com'을 단순 includes 하면 netflix.com 등에도 매칭됨 → resolveService에서 경계 매칭
    aliases: ['twitter', '트위터', 'x.com', 'x (twitter)', '(x)'],
    domain: 'x.com',
    officialUrl: 'https://x.com',
    // 로그인 상태 비밀번호 변경 허브 (비로그인 시 로그인 유도)
    passwordUrl: 'https://x.com/settings/password',
    securityUrl: 'https://x.com/settings/security_and_account_data',
  },
  {
    serviceName: 'Instagram',
    aliases: ['instagram', '인스타그램', 'insta'],
    domain: 'instagram.com',
    officialUrl: 'https://www.instagram.com',
    passwordUrl: 'https://www.instagram.com/accounts/password/change/',
    securityUrl: 'https://www.instagram.com/accounts/session/login_activity/',
  },
  {
    serviceName: 'Facebook',
    aliases: ['facebook', '페이스북', 'meta', '메타'],
    domain: 'facebook.com',
    officialUrl: 'https://www.facebook.com',
    passwordUrl: 'https://www.facebook.com/settings?tab=security&section=password',
    securityUrl: 'https://www.facebook.com/settings?tab=security',
  },
  {
    serviceName: 'Discord',
    aliases: ['discord', '디스코드'],
    domain: 'discord.com',
    officialUrl: 'https://discord.com/app',
    // 계정 설정 허브 (앱/웹 설정 → 내 계정)
    passwordUrl: 'https://discord.com/channels/@me',
    securityUrl: 'https://discord.com/channels/@me',
  },
  {
    serviceName: 'LinkedIn',
    aliases: ['linkedin', '링크드인'],
    domain: 'linkedin.com',
    officialUrl: 'https://www.linkedin.com',
    passwordUrl: 'https://www.linkedin.com/mypreferences/d/change-password',
    securityUrl: 'https://www.linkedin.com/mypreferences/d/categories/sign-in-and-security',
  },
  {
    serviceName: 'Reddit',
    aliases: ['reddit', '레딧'],
    domain: 'reddit.com',
    officialUrl: 'https://www.reddit.com',
    passwordUrl: 'https://www.reddit.com/settings/account',
    securityUrl: 'https://www.reddit.com/settings/privacy',
  },

  // ── Dev / productivity ─────────────────────────────────────────────────
  {
    serviceName: 'GitHub',
    aliases: ['github', '깃허브', 'git hub'],
    domain: 'github.com',
    officialUrl: 'https://github.com',
    passwordUrl: 'https://github.com/settings/security',
    securityUrl: 'https://github.com/settings/security',
  },
  {
    serviceName: 'Notion',
    aliases: ['notion', '노션'],
    domain: 'notion.so',
    officialUrl: 'https://www.notion.so',
    passwordUrl: 'https://www.notion.so/my-account',
    securityUrl: 'https://www.notion.so/my-account',
  },
  {
    serviceName: 'Slack',
    aliases: ['slack', '슬랙'],
    domain: 'slack.com',
    officialUrl: 'https://app.slack.com',
    passwordUrl: 'https://my.slack.com/account/settings',
    securityUrl: 'https://my.slack.com/account/settings',
  },
  {
    serviceName: 'Dropbox',
    aliases: ['dropbox', '드롭박스'],
    domain: 'dropbox.com',
    officialUrl: 'https://www.dropbox.com',
    passwordUrl: 'https://www.dropbox.com/account/security',
    securityUrl: 'https://www.dropbox.com/account/security',
  },
  {
    serviceName: 'Zoom',
    aliases: ['zoom', '줌'],
    domain: 'zoom.us',
    officialUrl: 'https://zoom.us',
    passwordUrl: 'https://zoom.us/profile',
    securityUrl: 'https://zoom.us/profile',
  },

  // ── Media / gaming ─────────────────────────────────────────────────────
  {
    serviceName: 'Netflix',
    aliases: ['netflix', '넷플릭스'],
    domain: 'netflix.com',
    officialUrl: 'https://www.netflix.com',
    passwordUrl: 'https://www.netflix.com/password',
    securityUrl: 'https://www.netflix.com/account',
  },
  {
    serviceName: 'Disney+',
    aliases: ['disney+', 'disney plus', '디즈니플러스', '디즈니+', 'disneyplus'],
    domain: 'disneyplus.com',
    officialUrl: 'https://www.disneyplus.com',
    passwordUrl: 'https://www.disneyplus.com/account',
    securityUrl: 'https://www.disneyplus.com/account',
  },
  {
    serviceName: 'Spotify',
    aliases: ['spotify', '스포티파이'],
    domain: 'spotify.com',
    officialUrl: 'https://www.spotify.com',
    passwordUrl: 'https://www.spotify.com/account/change-password/',
    securityUrl: 'https://www.spotify.com/account/overview/',
  },
  {
    serviceName: 'Steam',
    aliases: ['steam', '스팀'],
    domain: 'steampowered.com',
    officialUrl: 'https://store.steampowered.com',
    passwordUrl: 'https://store.steampowered.com/account/',
    securityUrl: 'https://store.steampowered.com/twofactor/',
  },
  {
    serviceName: 'Twitch',
    aliases: ['twitch', '트위치'],
    domain: 'twitch.tv',
    officialUrl: 'https://www.twitch.tv',
    passwordUrl: 'https://www.twitch.tv/settings/security',
    securityUrl: 'https://www.twitch.tv/settings/security',
  },

  // ── KR local ───────────────────────────────────────────────────────────
  {
    serviceName: 'Kakao',
    aliases: ['kakao', '카카오', '카카오톡', 'kakaotalk'],
    domain: 'kakao.com',
    officialUrl: 'https://accounts.kakao.com',
    passwordUrl: 'https://accounts.kakao.com/weblogin/account/info',
    securityUrl: 'https://accounts.kakao.com/weblogin/account/info',
  },
  {
    serviceName: 'Naver',
    aliases: ['naver', '네이버'],
    domain: 'naver.com',
    officialUrl: 'https://nid.naver.com',
    passwordUrl: 'https://nid.naver.com/user2/help/myInfoV2?m=viewSecurity',
    securityUrl: 'https://nid.naver.com/user2/help/myInfoV2?m=viewSecurity',
  },
  {
    serviceName: '사람인',
    aliases: ['사람인', 'saramin', 'mailinfo.saramin.co.kr', 'saramin.co.kr'],
    domain: 'saramin.co.kr',
    officialUrl: 'https://www.saramin.co.kr',
    passwordUrl: 'https://www.saramin.co.kr/zf_user/member/change-password',
    securityUrl: 'https://www.saramin.co.kr/zf_user/member/persons/account',
  },
  {
    serviceName: 'Toss',
    aliases: ['toss', '토스', 'tosspay'],
    domain: 'toss.im',
    officialUrl: 'https://toss.im',
    securityUrl: 'https://toss.im',
  },
  {
    serviceName: 'LINE',
    aliases: ['line', '라인'],
    domain: 'line.me',
    officialUrl: 'https://line.me',
    passwordUrl: 'https://account.line.biz',
    securityUrl: 'https://account.line.biz',
  },
  {
    serviceName: 'PayPal',
    aliases: ['paypal', '페이팔'],
    domain: 'paypal.com',
    officialUrl: 'https://www.paypal.com',
    passwordUrl: 'https://www.paypal.com/myaccount/security/password',
    securityUrl: 'https://www.paypal.com/myaccount/security',
  },
];

const CLEARBIT_BASE = 'https://logo.clearbit.com';

export function cleanServiceName(raw: string): string {
  const tokens = raw.split('|').map((t) => t.trim()).filter(Boolean);

  const isEmailToken = (t: string) =>
    /^<[^>]+@[^>]+>$/.test(t) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);

  let candidate = tokens[0] ?? raw;
  if (isEmailToken(candidate) && tokens[1]) {
    candidate = tokens[1];
  }

  const angleMatch = candidate.match(/^<([^>]+)>$/);
  if (angleMatch) {
    const inner = angleMatch[1];
    const domain = inner.split('@')[1];
    return domain ? domain.split('.')[0] : inner;
  }

  const cleaned = candidate.replace(/\s*<[^>]+>\s*$/, '').trim();
  return cleaned || raw;
}

export type ResolvedService = {
  serviceName: string;
  iconUrl: string | null;
  iconLabel: string;
  officialUrl: string | null;
  passwordUrl: string | null;
  securityUrl: string | null;
  /** registry hit vs unknown fallback */
  fromRegistry: boolean;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 도메인/짧은 alias가 다른 문자열 내부에 끼어 매칭되는 것 방지 (x.com ⊂ netflix.com) */
function textMatchesToken(haystack: string, token: string): boolean {
  const t = token.toLowerCase();
  if (!t) return false;
  // 점이 포함된 도메인형: 앞이 영숫자면 부분 문자열 매칭 거부
  if (t.includes('.')) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(t)}(?:[^a-z0-9]|$)`, 'i').test(haystack);
  }
  // 짧은 토큰(≤2): 단어 경계
  if (t.length <= 2) {
    return new RegExp(`(?:^|[^a-z0-9가-힣])${escapeRegExp(t)}(?:[^a-z0-9가-힣]|$)`, 'i').test(
      haystack,
    );
  }
  return haystack.includes(t);
}

export function resolveService(...candidates: (string | null | undefined)[]): ResolvedService {
  const texts = candidates
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const lower = texts.join('\n').toLowerCase();

  // 가장 긴(구체적) 매칭을 선택 — 등록 순서에 덜 민감
  let best: { item: (typeof SERVICE_REGISTRY)[number]; score: number } | null = null;
  for (const item of SERVICE_REGISTRY) {
    let score = 0;
    const domain = item.domain.toLowerCase();
    if (textMatchesToken(lower, domain)) {
      score = Math.max(score, domain.length + 100);
    }
    for (const alias of item.aliases) {
      if (textMatchesToken(lower, alias)) {
        score = Math.max(score, alias.length + (alias.includes('.') ? 50 : 0));
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { item, score };
    }
  }

  if (best) {
    const found = best.item;
    return {
      serviceName: found.serviceName,
      iconUrl: `${CLEARBIT_BASE}/${found.domain}`,
      iconLabel: found.serviceName[0].toUpperCase(),
      officialUrl: found.officialUrl,
      passwordUrl: found.passwordUrl ?? null,
      securityUrl: found.securityUrl ?? null,
      fromRegistry: true,
    };
  }

  const fallbackName = cleanServiceName(texts[0] ?? 'Unknown');
  const label = fallbackName.charAt(0).toUpperCase() || '?';
  return {
    serviceName: fallbackName,
    iconUrl: null,
    iconLabel: label,
    officialUrl: null,
    passwordUrl: null,
    securityUrl: null,
    fromRegistry: false,
  };
}

/** 사용자 메시지에서 registry 서비스 이름을 추정 (2-4 OOD 링크용) */
export function detectServiceFromText(text: string): ResolvedService | null {
  const hit = resolveService(text);
  return hit.fromRegistry ? hit : null;
}
