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
    passwordUrl: 'https://accountscenter.instagram.com/password_and_security/',
    securityUrl: 'https://accountscenter.instagram.com/password_and_security/',
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
    securityUrl: 'https://store.steampowered.com/account/',
  },
  {
    serviceName: 'Twitch',
    aliases: ['twitch', '트위치'],
    domain: 'twitch.tv',
    officialUrl: 'https://www.twitch.tv',
    passwordUrl: 'https://www.twitch.tv/settings/security',
    securityUrl: 'https://www.twitch.tv/settings/security',
  },

  // ── Design / productivity (global) ────────────────────────────────────
  {
    serviceName: 'Figma',
    aliases: ['figma', '피그마'],
    domain: 'figma.com',
    officialUrl: 'https://www.figma.com',
    passwordUrl: 'https://www.figma.com/settings',
    securityUrl: 'https://www.figma.com/settings',
  },
  {
    serviceName: 'Canva',
    aliases: ['canva', '캔바', '캔버'],
    domain: 'canva.com',
    officialUrl: 'https://www.canva.com',
    passwordUrl: 'https://www.canva.com/settings',
    securityUrl: 'https://www.canva.com/settings',
  },
  {
    serviceName: 'Adobe',
    aliases: ['adobe', '어도비', 'creative cloud', 'creativecloud', 'photoshop', 'illustrator', 'acrobat'],
    domain: 'adobe.com',
    officialUrl: 'https://account.adobe.com',
    passwordUrl: 'https://account.adobe.com',
    securityUrl: 'https://account.adobe.com',
  },

  // ── AI / cloud platforms ───────────────────────────────────────────────
  {
    serviceName: 'OpenAI',
    aliases: ['openai', '오픈ai', 'chatgpt', '챗gpt', 'chat gpt', 'chatgpt plus'],
    domain: 'openai.com',
    officialUrl: 'https://platform.openai.com',
    securityUrl: 'https://platform.openai.com/settings',
  },
  {
    serviceName: 'Anthropic',
    aliases: ['anthropic', 'claude', 'claude ai', '클로드'],
    domain: 'anthropic.com',
    officialUrl: 'https://console.anthropic.com',
    securityUrl: 'https://console.anthropic.com/settings/keys',
  },

  // ── Dev platforms ──────────────────────────────────────────────────────
  {
    serviceName: 'Vercel',
    aliases: ['vercel', '버셀'],
    domain: 'vercel.com',
    officialUrl: 'https://vercel.com/dashboard',
    securityUrl: 'https://vercel.com/account/security',
  },
  {
    serviceName: 'Railway',
    aliases: ['railway', '레일웨이'],
    domain: 'railway.app',
    officialUrl: 'https://railway.app',
    securityUrl: 'https://railway.app/account',
  },
  {
    serviceName: 'Supabase',
    aliases: ['supabase', '수파베이스'],
    domain: 'supabase.com',
    officialUrl: 'https://supabase.com/dashboard',
    securityUrl: 'https://supabase.com/dashboard',
  },
  {
    serviceName: 'JetBrains',
    aliases: ['jetbrains', '젯브레인', 'intellij', 'pycharm', 'webstorm', 'goland', 'rider'],
    domain: 'jetbrains.com',
    officialUrl: 'https://account.jetbrains.com',
    passwordUrl: 'https://account.jetbrains.com',
    securityUrl: 'https://account.jetbrains.com',
  },
  {
    serviceName: 'Unity',
    aliases: ['unity', '유니티', 'unity3d'],
    domain: 'unity.com',
    officialUrl: 'https://unity.com',
    passwordUrl: 'https://id.unity.com/en/account/edit',
    securityUrl: 'https://id.unity.com/en/account/edit',
  },

  // ── Education ──────────────────────────────────────────────────────────
  {
    serviceName: 'Coursera',
    aliases: ['coursera', '코세라'],
    domain: 'coursera.org',
    officialUrl: 'https://www.coursera.org',
    securityUrl: 'https://www.coursera.org/account/profile',
  },
  {
    serviceName: 'Codecademy',
    aliases: ['codecademy', '코드아카데미'],
    domain: 'codecademy.com',
    officialUrl: 'https://www.codecademy.com',
  },

  // ── Device / hardware accounts ─────────────────────────────────────────
  {
    serviceName: 'Samsung Account',
    aliases: ['samsung', '삼성', '삼성계정', 'samsung account', '삼성 account', 'galaxy'],
    domain: 'samsung.com',
    officialUrl: 'https://account.samsung.com',
    securityUrl: 'https://account.samsung.com',
  },

  // ── Commerce / travel ──────────────────────────────────────────────────
  {
    serviceName: 'Hotels.com',
    aliases: ['hotels.com', 'hotels', '호텔스닷컴'],
    domain: 'hotels.com',
    officialUrl: 'https://www.hotels.com',
    securityUrl: 'https://www.hotels.com/account-settings',
  },
  {
    serviceName: 'Marriott Bonvoy',
    aliases: ['marriott', 'marriott bonvoy', '메리어트', 'bonvoy'],
    domain: 'marriott.com',
    officialUrl: 'https://www.marriott.com',
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
    passwordUrl: 'https://account.line.me',
    securityUrl: 'https://account.line.me',
  },
  {
    serviceName: 'PayPal',
    aliases: ['paypal', '페이팔'],
    domain: 'paypal.com',
    officialUrl: 'https://www.paypal.com',
    passwordUrl: 'https://www.paypal.com/myaccount/security/password',
    securityUrl: 'https://www.paypal.com/myaccount/security',
  },
  {
    serviceName: '인프런',
    aliases: ['인프런', 'inflearn', '인프런 소식'],
    domain: 'inflearn.com',
    officialUrl: 'https://www.inflearn.com',
  },
  {
    serviceName: '프로그래머스',
    aliases: ['프로그래머스', 'programmers', 'programmers.co.kr'],
    domain: 'programmers.co.kr',
    officialUrl: 'https://programmers.co.kr',
  },
  {
    serviceName: '아임웹',
    aliases: ['아임웹', 'imweb', 'imweb.me'],
    domain: 'imweb.me',
    officialUrl: 'https://imweb.me',
  },
  {
    serviceName: '위시켓',
    aliases: ['위시켓', 'wishket'],
    domain: 'wishket.com',
    officialUrl: 'https://www.wishket.com',
  },
  {
    serviceName: 'Make',
    aliases: ['make', 'make.com', 'integromat', '메이크'],
    domain: 'make.com',
    officialUrl: 'https://www.make.com',
    securityUrl: 'https://www.make.com/en/account/profile',
  },
  {
    serviceName: 'CLIP STUDIO PAINT',
    aliases: ['clip studio', 'clipstudio', 'celsys', 'clip studio paint', '클립스튜디오'],
    domain: 'clipstudio.net',
    officialUrl: 'https://www.clipstudio.net',
  },

  // ── KR streaming / music ───────────────────────────────────────────────
  {
    serviceName: '티빙',
    aliases: ['티빙', 'tving', 'cj ent', 'cjenm'],
    domain: 'tving.com',
    officialUrl: 'https://www.tving.com',
  },
  {
    serviceName: '웨이브',
    aliases: ['웨이브', 'wavve', 'wavve.com'],
    domain: 'wavve.com',
    officialUrl: 'https://www.wavve.com',
    securityUrl: 'https://www.wavve.com/member/mypage',
  },
  {
    serviceName: '왓챠',
    aliases: ['왓챠', 'watcha', 'watchaplay'],
    domain: 'watcha.com',
    officialUrl: 'https://watcha.com',
    securityUrl: 'https://watcha.com/settings/account',
  },
  {
    serviceName: '멜론',
    aliases: ['멜론', 'melon', 'melon music'],
    domain: 'melon.com',
    officialUrl: 'https://www.melon.com',
  },
  {
    serviceName: '지니뮤직',
    aliases: ['지니', '지니뮤직', 'genie', 'genie music', 'genie.co.kr'],
    domain: 'genie.co.kr',
    officialUrl: 'https://genie.co.kr',
    securityUrl: 'https://genie.co.kr/mypage',
  },
  {
    serviceName: '벅스',
    aliases: ['벅스', 'bugs', 'bugs music', 'bugs.co.kr'],
    domain: 'bugs.co.kr',
    officialUrl: 'https://www.bugs.co.kr',
  },

  // ── KR food delivery ──────────────────────────────────────────────────
  {
    serviceName: '배달의민족',
    aliases: ['배달의민족', '배민', 'baemin', 'woowa'],
    domain: 'baemin.com',
    officialUrl: 'https://www.baemin.com',
  },
  {
    serviceName: '요기요',
    aliases: ['요기요', 'yogiyo'],
    domain: 'yogiyo.co.kr',
    officialUrl: 'https://www.yogiyo.co.kr',
  },

  // ── KR shopping ───────────────────────────────────────────────────────
  {
    serviceName: 'SSG.COM',
    aliases: ['ssg', 'ssg.com', '신세계몰', '이마트몰', 'shinsegae'],
    domain: 'ssg.com',
    officialUrl: 'https://www.ssg.com',
  },
  {
    serviceName: '옥션',
    aliases: ['옥션', 'auction', 'auction.co.kr'],
    domain: 'auction.co.kr',
    officialUrl: 'https://www.auction.co.kr',
  },
  {
    serviceName: '무신사',
    aliases: ['무신사', 'musinsa'],
    domain: 'musinsa.com',
    officialUrl: 'https://www.musinsa.com',
    securityUrl: 'https://www.musinsa.com/member/mypage',
  },
  {
    serviceName: '마켓컬리',
    aliases: ['마켓컬리', '컬리', 'kurly', 'marketkurly'],
    domain: 'kurly.com',
    officialUrl: 'https://www.kurly.com',
  },
  {
    serviceName: '번개장터',
    aliases: ['번개장터', '번장', 'bunjang'],
    domain: 'bunjang.co.kr',
    officialUrl: 'https://www.bunjang.co.kr',
  },

  // ── KR education ──────────────────────────────────────────────────────
  {
    serviceName: '클래스101',
    aliases: ['클래스101', 'class101', '클래스 101'],
    domain: 'class101.net',
    officialUrl: 'https://class101.net',
  },
  {
    serviceName: '패스트캠퍼스',
    aliases: ['패스트캠퍼스', 'fastcampus', '패스트 캠퍼스'],
    domain: 'fastcampus.co.kr',
    officialUrl: 'https://fastcampus.co.kr',
  },
  {
    serviceName: '탈잉',
    aliases: ['탈잉', 'taling'],
    domain: 'taling.me',
    officialUrl: 'https://taling.me',
  },
  {
    serviceName: '제로베이스',
    aliases: ['제로베이스', 'zerobase', 'zero-base', 'zero base'],
    domain: 'zero-base.co.kr',
    officialUrl: 'https://zero-base.co.kr',
  },
  {
    serviceName: 'Udemy',
    aliases: ['udemy', '유데미'],
    domain: 'udemy.com',
    officialUrl: 'https://www.udemy.com',
  },

  // ── KR jobs ───────────────────────────────────────────────────────────
  {
    serviceName: '잡코리아',
    aliases: ['잡코리아', 'jobkorea', 'job korea'],
    domain: 'jobkorea.co.kr',
    officialUrl: 'https://www.jobkorea.co.kr',
  },
  {
    serviceName: '원티드',
    aliases: ['원티드', 'wanted', 'wantedlab'],
    domain: 'wanted.co.kr',
    officialUrl: 'https://www.wanted.co.kr',
  },

  // ── Global social ─────────────────────────────────────────────────────
  {
    serviceName: 'TikTok',
    aliases: ['tiktok', '틱톡', 'bytedance'],
    domain: 'tiktok.com',
    officialUrl: 'https://www.tiktok.com',
    securityUrl: 'https://www.tiktok.com/settings',
  },
  {
    serviceName: 'Pinterest',
    aliases: ['pinterest', '핀터레스트'],
    domain: 'pinterest.com',
    officialUrl: 'https://www.pinterest.com',
    securityUrl: 'https://www.pinterest.com/settings/security',
  },
  {
    serviceName: 'Telegram',
    aliases: ['telegram', '텔레그램'],
    domain: 'telegram.org',
    officialUrl: 'https://web.telegram.org',
  },
  {
    serviceName: 'WhatsApp',
    aliases: ['whatsapp', '왓츠앱', 'whats app'],
    domain: 'whatsapp.com',
    officialUrl: 'https://www.whatsapp.com',
  },
  {
    serviceName: 'Snapchat',
    aliases: ['snapchat', '스냅챗'],
    domain: 'snapchat.com',
    officialUrl: 'https://accounts.snapchat.com',
  },

  // ── Gaming ────────────────────────────────────────────────────────────
  {
    serviceName: 'Nintendo',
    aliases: ['nintendo', '닌텐도', 'nintendo switch', '닌텐도 스위치', 'nintendo account'],
    domain: 'nintendo.com',
    officialUrl: 'https://accounts.nintendo.com',
    securityUrl: 'https://accounts.nintendo.com/profile/edit',
  },
  {
    serviceName: 'PlayStation',
    aliases: ['playstation', '플스', 'psn', 'ps4', 'ps5', 'sony', 'play station'],
    domain: 'playstation.com',
    officialUrl: 'https://www.playstation.com',
  },
  {
    serviceName: 'Epic Games',
    aliases: ['epic games', 'epicgames', 'epic', 'fortnite', '에픽게임즈', '포트나이트'],
    domain: 'epicgames.com',
    officialUrl: 'https://www.epicgames.com/id/',
  },
  {
    serviceName: 'Riot Games',
    aliases: ['riot', 'riot games', '라이엇', '라이엇게임즈', 'league of legends', '리그오브레전드', 'lol', 'valorant', '발로란트'],
    domain: 'riotgames.com',
    officialUrl: 'https://account.riotgames.com',
    securityUrl: 'https://account.riotgames.com',
  },
  {
    serviceName: 'Battle.net',
    aliases: ['battle.net', 'battlenet', 'blizzard', '블리자드', 'overwatch', '오버워치', 'wow', 'world of warcraft', 'starcraft', '스타크래프트', 'hearthstone'],
    domain: 'battle.net',
    officialUrl: 'https://account.blizzard.com',
    securityUrl: 'https://account.blizzard.com',
  },
  {
    serviceName: 'EA',
    aliases: ['ea', 'electronic arts', 'ea games', 'origin', 'ea app', 'fifa', 'apex legends', 'apex', 'the sims', '이에이'],
    domain: 'ea.com',
    officialUrl: 'https://www.ea.com',
  },

  // ── Dev / cloud ───────────────────────────────────────────────────────
  {
    serviceName: 'GitLab',
    aliases: ['gitlab', '깃랩', 'git lab'],
    domain: 'gitlab.com',
    officialUrl: 'https://gitlab.com',
    securityUrl: 'https://gitlab.com/-/user_settings/profile',
  },
  {
    serviceName: 'Cloudflare',
    aliases: ['cloudflare', '클라우드플레어'],
    domain: 'cloudflare.com',
    officialUrl: 'https://dash.cloudflare.com',
    securityUrl: 'https://dash.cloudflare.com/profile',
  },
  {
    serviceName: 'Netlify',
    aliases: ['netlify', '넷리파이'],
    domain: 'netlify.com',
    officialUrl: 'https://app.netlify.com',
    securityUrl: 'https://app.netlify.com/user/settings',
  },
  {
    serviceName: 'DigitalOcean',
    aliases: ['digitalocean', 'digital ocean', '디지털오션'],
    domain: 'digitalocean.com',
    officialUrl: 'https://cloud.digitalocean.com',
    securityUrl: 'https://cloud.digitalocean.com/account',
  },
  {
    serviceName: 'Heroku',
    aliases: ['heroku', '헤로쿠'],
    domain: 'heroku.com',
    officialUrl: 'https://dashboard.heroku.com',
  },
  {
    serviceName: 'Atlassian',
    aliases: ['atlassian', 'jira', '지라', 'confluence', '컨플루언스', 'trello', '트렐로', 'bitbucket'],
    domain: 'atlassian.com',
    officialUrl: 'https://id.atlassian.com',
    securityUrl: 'https://id.atlassian.com/manage-profile/security',
  },
  {
    serviceName: 'AWS',
    aliases: ['aws', 'amazon web services', 'amazon aws', 'ec2', 's3', 'lambda'],
    domain: 'aws.amazon.com',
    officialUrl: 'https://aws.amazon.com',
  },

  // ── Travel ────────────────────────────────────────────────────────────
  {
    serviceName: 'Airbnb',
    aliases: ['airbnb', '에어비앤비', 'air bnb'],
    domain: 'airbnb.com',
    officialUrl: 'https://www.airbnb.com',
    securityUrl: 'https://www.airbnb.com/account-settings',
  },
  {
    serviceName: 'Booking.com',
    aliases: ['booking.com', 'booking', '부킹닷컴'],
    domain: 'booking.com',
    officialUrl: 'https://www.booking.com',
    securityUrl: 'https://account.booking.com',
  },
  {
    serviceName: 'Agoda',
    aliases: ['agoda', '아고다'],
    domain: 'agoda.com',
    officialUrl: 'https://www.agoda.com',
  },

  // ── Finance ───────────────────────────────────────────────────────────
  {
    serviceName: 'Stripe',
    aliases: ['stripe', '스트라이프'],
    domain: 'stripe.com',
    officialUrl: 'https://dashboard.stripe.com',
    securityUrl: 'https://dashboard.stripe.com/settings/user',
  },
  {
    serviceName: 'Wise',
    aliases: ['wise', 'transferwise', '트랜스퍼와이즈', '와이즈'],
    domain: 'wise.com',
    officialUrl: 'https://wise.com',
  },
  {
    serviceName: 'Coinbase',
    aliases: ['coinbase', '코인베이스'],
    domain: 'coinbase.com',
    officialUrl: 'https://www.coinbase.com',
    securityUrl: 'https://www.coinbase.com/settings/security',
  },
];



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
      iconUrl: `https://www.google.com/s2/favicons?domain=${found.domain}&sz=128`,
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
