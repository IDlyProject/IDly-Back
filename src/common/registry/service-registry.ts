export interface ServiceRegistryItem {
  serviceName: string;
  aliases: string[];
  domain: string;
  officialUrl: string;
  passwordUrl?: string;
  securityUrl?: string;
}

export const SERVICE_REGISTRY: ServiceRegistryItem[] = [
  {
    serviceName: 'Google',
    aliases: ['google', '구글'],
    domain: 'google.com',
    officialUrl: 'https://myaccount.google.com',
    passwordUrl: 'https://myaccount.google.com/security',
    securityUrl: 'https://myaccount.google.com/security',
  },
  {
    serviceName: 'YouTube',
    aliases: ['youtube', '유튜브'],
    domain: 'youtube.com',
    officialUrl: 'https://www.youtube.com',
    securityUrl: 'https://myaccount.google.com/security',
  },
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
    serviceName: 'Apple',
    aliases: ['apple', '애플', 'apple id', 'appleid'],
    domain: 'apple.com',
    officialUrl: 'https://appleid.apple.com',
    passwordUrl: 'https://appleid.apple.com',
    securityUrl: 'https://appleid.apple.com',
  },
  {
    serviceName: 'Amazon',
    aliases: ['amazon', '아마존'],
    domain: 'amazon.com',
    officialUrl: 'https://www.amazon.com',
    passwordUrl: 'https://www.amazon.com/gp/css/edit-password-entry',
    securityUrl: 'https://www.amazon.com/gp/css/homepage.html',
  },
  {
    serviceName: 'GitHub',
    aliases: ['github', '깃허브', 'git hub'],
    domain: 'github.com',
    officialUrl: 'https://github.com',
    passwordUrl: 'https://github.com/password_reset',
    securityUrl: 'https://github.com/settings/security',
  },
  {
    serviceName: 'Microsoft',
    aliases: ['microsoft', '마이크로소프트', 'ms', 'outlook', '아웃룩', 'hotmail', 'live.com'],
    domain: 'microsoft.com',
    officialUrl: 'https://account.microsoft.com',
    passwordUrl: 'https://account.live.com/password/reset',
    securityUrl: 'https://account.microsoft.com/security',
  },
  {
    serviceName: 'Kakao',
    aliases: ['kakao', '카카오', '카카오톡', 'kakaobank', '카카오뱅크'],
    domain: 'kakao.com',
    officialUrl: 'https://accounts.kakao.com',
    passwordUrl: 'https://accounts.kakao.com/login/find_account',
    securityUrl: 'https://accounts.kakao.com',
  },
  {
    serviceName: 'Naver',
    aliases: ['naver', '네이버'],
    domain: 'naver.com',
    officialUrl: 'https://nid.naver.com',
    passwordUrl: 'https://nid.naver.com/user2/help/pwdFind',
    securityUrl: 'https://nid.naver.com/user2/myInfoV2',
  },
  {
    serviceName: 'Instagram',
    aliases: ['instagram', '인스타그램', 'insta'],
    domain: 'instagram.com',
    officialUrl: 'https://www.instagram.com',
    passwordUrl: 'https://www.instagram.com/accounts/password/reset/',
    securityUrl: 'https://www.instagram.com/accounts/privacy_and_security/',
  },
  {
    serviceName: 'Facebook',
    aliases: ['facebook', '페이스북', 'meta', '메타'],
    domain: 'facebook.com',
    officialUrl: 'https://www.facebook.com',
    passwordUrl: 'https://www.facebook.com/login/identify',
    securityUrl: 'https://www.facebook.com/settings?tab=security',
  },
  {
    serviceName: 'Twitter',
    aliases: ['twitter', '트위터', 'x.com', 'x'],
    domain: 'x.com',
    officialUrl: 'https://x.com',
    passwordUrl: 'https://x.com/account/begin_password_reset',
    securityUrl: 'https://x.com/settings/security_and_account_data',
  },
  {
    serviceName: 'Coupang',
    aliases: ['coupang', '쿠팡'],
    domain: 'coupang.com',
    officialUrl: 'https://www.coupang.com',
    passwordUrl: 'https://www.coupang.com/member/findPassword',
    securityUrl: 'https://www.coupang.com/member/account/memberInfo',
  },
];

const CLEARBIT_BASE = 'https://logo.clearbit.com';

function cleanServiceName(raw: string): string {
  // "Name | Description <email@domain>" → "Name"
  const pipeClean = raw.split('|')[0].trim();
  // "<email@domain>" or "email@domain" → extract domain
  const angleMatch = pipeClean.match(/^<([^>]+)>$/);
  if (angleMatch) {
    const inner = angleMatch[1];
    const domain = inner.split('@')[1];
    return domain ? domain.split('.')[0] : inner;
  }
  // Remove trailing <email> if present
  return pipeClean.replace(/\s*<[^>]+>\s*$/, '').trim() || raw;
}

export function resolveService(...candidates: (string | null | undefined)[]): {
  serviceName: string;
  iconUrl: string | null;
  iconLabel: string;
  officialUrl: string | null;
  passwordUrl: string | null;
  securityUrl: string | null;
} {
  const texts = candidates
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const lower = texts.join('\n').toLowerCase();
  const found = SERVICE_REGISTRY.find((item) =>
    lower.includes(item.domain.toLowerCase()) ||
    item.aliases.some((alias) => lower.includes(alias.toLowerCase())),
  );

  if (found) {
    return {
      serviceName: found.serviceName,
      iconUrl: `${CLEARBIT_BASE}/${found.domain}`,
      iconLabel: found.serviceName[0].toUpperCase(),
      officialUrl: found.officialUrl,
      passwordUrl: found.passwordUrl ?? null,
      securityUrl: found.securityUrl ?? null,
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
  };
}
