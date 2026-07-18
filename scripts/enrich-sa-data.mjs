/**
 * enrich-sa-data.mjs
 *
 * 1. mbox 파일에서 보안 이메일 추출
 * 2. Solar LLM으로 SA별 헤드라인/요약/ActionItem description 생성
 * 3. DB 업데이트
 * 4. ActionItem type='unknown' KB re-merge
 *
 * Usage: node scripts/enrich-sa-data.mjs
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createReadStream } from 'fs';
import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// .env 파싱
const env = {};
try {
  readFileSync(resolve(ROOT, '.env'), 'utf8')
    .split('\n').forEach(line => {
      const m = line.match(/^(\w+)="?([^"#]*)"?/);
      if (m) env[m[1]] = m[2].trim();
    });
} catch {}

const DATABASE_URL = env.DATABASE_URL;
const SOLAR_API_KEY = env.SOLAR_API_KEY;
const SOLAR_URL = 'https://api.upstage.ai/v1/chat/completions';
const MBOX_DIR = '/Users/janghyeonseo/Desktop/IDly/mbox-exports/2026-07-18T07-47-53-638Z';

const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── 보안 키워드 필터 ─────────────────────────────────────────────────────────
const SECURITY_SUBJECT_RE = /비밀번호|보안|로그인|인증|경고|재설정|알림|승인|권한|접근|계정.*확인|확인.*계정|password|security|login|verif|warning|reset|alert|access|suspicious|unusual|signin|sign.in|new.device|unrecognized|breach|compromised/i;

// 서비스 도메인 → 서비스명 매핑
const DOMAIN_SERVICE_MAP = {
  'amazon.com': 'Amazon', 'amazon.co.kr': 'Amazon', 'aws.amazon.com': 'Amazon',
  'accounts.google.com': 'Google', 'google.com': 'Google', 'no-reply@google.com': 'Google',
  'twitter.com': 'Twitter', 'x.com': 'Twitter', 'mail.x.com': 'Twitter',
  'github.com': 'GitHub',
  'microsoft.com': 'Microsoft', 'outlook.com': 'Microsoft', 'live.com': 'Microsoft',
  'kakao.com': 'Kakao', 'kakaocorp.com': 'Kakao',
  'naver.com': 'Naver',
  'instagram.com': 'Instagram', 'facebookmail.com': 'Facebook', 'fb.com': 'Facebook',
  'netflix.com': 'Netflix',
  'apple.com': 'Apple', 'icloud.com': 'Apple',
  'coupang.com': 'Coupang',
  'saramin.co.kr': '사람인', 'mailinfo.saramin.co.kr': '사람인',
};

// ── mbox 파서 ────────────────────────────────────────────────────────────────

function decodeMimeWord(str) {
  if (!str) return str;
  // =?UTF-8?B?...?= base64
  str = str.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b64) => {
    try { return Buffer.from(b64, 'base64').toString('utf8'); } catch { return _; }
  });
  // =?UTF-8?Q?...?= quoted-printable
  str = str.replace(/=\?UTF-8\?Q\?([^?]+)\?=/gi, (_, qp) => {
    try { return qp.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16))); } catch { return _; }
  });
  // =?EUC-KR?B?...?= (legacy)
  str = str.replace(/=\?(?:EUC-KR|KSC5601|ISO-2022-KR)\?B\?([^?]+)\?=/gi, (_, b64) => {
    try { return Buffer.from(b64, 'base64').toString('binary'); } catch { return _; }
  });
  return str.trim();
}

function senderDomain(fromHeader) {
  if (!fromHeader) return null;
  const match = fromHeader.match(/@([\w.\-]+)/);
  return match ? match[1].toLowerCase() : null;
}

function resolveServiceFromDomain(domain) {
  if (!domain) return null;
  // 직접 매핑
  if (DOMAIN_SERVICE_MAP[domain]) return DOMAIN_SERVICE_MAP[domain];
  // 상위 도메인 매핑 (e.g. 'mail.twitter.com' → 'twitter.com')
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const sub = parts.slice(i).join('.');
    if (DOMAIN_SERVICE_MAP[sub]) return DOMAIN_SERVICE_MAP[sub];
  }
  return null;
}

/**
 * mbox 파일 스트리밍 파싱 — 보안 이메일 추출
 * maxPerService: 서비스당 최대 수집 수
 */
async function extractSecurityEmails(mboxPath, maxPerService = 30) {
  if (!existsSync(mboxPath)) return {};

  const serviceEmails = {}; // serviceName → [{from, subject, date, snippet}]
  const totalSeen = {};

  let currentHeaders = {};
  let inHeaders = true;
  let bodyLines = [];
  let bodyCollect = false;

  const flush = () => {
    if (!currentHeaders.subject && !currentHeaders.from) return;
    const subject = decodeMimeWord(currentHeaders.subject || '');
    const from = currentHeaders.from || '';
    const date = currentHeaders.date || '';
    const domain = senderDomain(from);
    const service = resolveServiceFromDomain(domain);

    const isSecurityEmail = SECURITY_SUBJECT_RE.test(subject) || SECURITY_SUBJECT_RE.test(from);

    if (service && isSecurityEmail) {
      if (!serviceEmails[service]) serviceEmails[service] = [];
      if (!totalSeen[service]) totalSeen[service] = 0;
      if (totalSeen[service] < maxPerService) {
        const snippet = bodyLines.join(' ').replace(/\s+/g, ' ').slice(0, 200);
        serviceEmails[service].push({ from, subject, date, snippet });
        totalSeen[service]++;
      }
    }

    currentHeaders = {};
    bodyLines = [];
    inHeaders = true;
    bodyCollect = false;
  };

  await new Promise((res, rej) => {
    const rl = createInterface({ input: createReadStream(mboxPath, { encoding: 'utf8' }), crlfDelay: Infinity });
    rl.on('line', line => {
      if (line.startsWith('From ') && (line.includes('@') || line.includes('mboxrd'))) {
        flush();
        return;
      }
      if (inHeaders) {
        if (line === '') {
          inHeaders = false;
          bodyCollect = bodyLines.length < 10; // 헤더만으로 충분하면 body 생략
          return;
        }
        // 연속 헤더 (folding)
        if (line.startsWith(' ') || line.startsWith('\t')) {
          const key = Object.keys(currentHeaders).pop();
          if (key) currentHeaders[key] += ' ' + line.trim();
          return;
        }
        const colon = line.indexOf(':');
        if (colon > 0) {
          const key = line.slice(0, colon).toLowerCase();
          const val = line.slice(colon + 1).trim();
          if (['from', 'subject', 'date'].includes(key)) {
            currentHeaders[key] = val;
          }
        }
      } else if (bodyCollect && bodyLines.length < 5) {
        const stripped = line.replace(/<[^>]+>/g, '').replace(/[=][0-9A-F]{2}/gi, '').trim();
        if (stripped.length > 10) bodyLines.push(stripped);
      }
    });
    rl.on('close', () => { flush(); res(); });
    rl.on('error', rej);
  });

  return serviceEmails;
}

// ── Solar LLM 호출 ───────────────────────────────────────────────────────────

async function callSolar(prompt, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(SOLAR_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SOLAR_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'solar-pro',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content ?? '';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      return JSON.parse(cleaned);
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

// ── SA별 Solar 보강 프롬프트 ─────────────────────────────────────────────────

const RISK_TYPE_KO = {
  new_device_login: '새 기기 로그인 감지',
  password_reset: '비밀번호 재설정 요청 감지',
  verification_code: '인증 코드 요청 감지',
  account_recovery: '계정 복구 시도 감지',
  permission_grant: '앱 권한 부여 요청 감지',
  security_recommendation: '보안 알림 수신',
};

const STEP_TYPE_KO = {
  change_password: '새 비밀번호로 변경',
  logout_sessions: '알 수 없는 기기 로그아웃',
  enable_2fa: '2단계 인증 설정',
  verify_activity: '본인 활동 여부 확인',
  check_recovery: '복구 수단 확인',
  review_apps: '연결된 앱 목록 확인',
  revoke_app_access: '모르는 앱 권한 해제',
  security_review: '보안 상태 점검',
};

function buildEnrichPrompt(sa, emails, actionItems) {
  const emailList = emails.slice(0, 8).map((e, i) =>
    `${i + 1}. [${e.date?.slice(0, 16) || '날짜 미상'}] 제목: "${e.subject}" | 발신: ${e.from?.slice(0, 60)}`
  ).join('\n');

  const stepList = actionItems.map(item =>
    `- ${item.type} (${STEP_TYPE_KO[item.type] || item.type})`
  ).join('\n');

  return `당신은 IDly 보안 앱의 데이터 품질 개선 AI입니다. 한국어 존댓말로 작성하세요.

서비스: ${sa.serviceName}
위험 유형: ${sa.primaryRiskType} (${RISK_TYPE_KO[sa.primaryRiskType] || sa.primaryRiskType})
현재 헤드라인: ${sa.headline || '없음'}

실제 감지된 보안 이메일 (최신순):
${emailList || '(이메일 없음 — 기존 DB 데이터 기반으로 작성)'}

조치 항목:
${stepList || '없음'}

다음 JSON으로만 응답하세요:
{
  "headline": "서비스명 포함, 16자 이내 구체적 헤드라인 (예: 'Amazon 비밀번호 재설정 감지', 'X 새 기기 로그인 경고'). 이메일 내용을 최대한 반영하세요. '오늘 안에 확인 필요' 같은 범용 문구 금지.",
  "summary": "실제 이메일 내용 기반 2문장 상황 설명. 첫 문장: 어떤 활동이 감지됐는지. 둘째 문장: 왜 조치가 필요한지. 각 문장 30자 이내.",
  "actionDescriptions": {
    "<stepType>": "이 상황에서 해야 할 구체적 행동 (30자 이내, 이메일 컨텍스트 반영)"
  }
}`;
}

// ── KB stepType re-merge ─────────────────────────────────────────────────────

const ACTION_KB = {
  new_device_login: ['change_password', 'logout_sessions', 'enable_2fa'],
  password_reset: ['verify_activity', 'change_password', 'check_recovery'],
  verification_code: ['verify_activity', 'change_password'],
  account_recovery: ['verify_activity', 'change_password', 'check_recovery'],
  permission_grant: ['review_apps', 'revoke_app_access', 'change_password'],
  security_recommendation: ['security_review', 'enable_2fa'],
};

const KB_TITLES = {
  change_password: '새 비밀번호로 변경',
  logout_sessions: '알 수 없는 기기 로그아웃',
  enable_2fa: '2단계 인증 설정',
  verify_activity: '재설정 요청이 본인 활동인지 확인',
  check_recovery: '복구 이메일·전화번호 확인',
  review_apps: '연결된 앱·권한 목록 확인',
  revoke_app_access: '모르는 앱 권한 해제',
  security_review: '보안 알림 확인',
};

const KB_WHY = {
  change_password: '비밀번호를 바꾸면 기존 세션이 모두 만료돼 불법 접근이 차단돼요.',
  logout_sessions: '의심 기기의 세션을 끊으면 진행 중인 불법 접근을 차단할 수 있어요.',
  enable_2fa: '2단계 인증이 켜져 있으면 비밀번호가 유출돼도 로그인을 막을 수 있어요.',
  verify_activity: '내가 요청하지 않은 재설정 메일은 계정 탈취 시도일 수 있어요.',
  check_recovery: '공격자가 복구 수단을 바꿨다면 계정을 영구적으로 잃을 수 있어요.',
  review_apps: '모르는 앱이 계정 권한을 갖고 있으면 데이터가 지속적으로 노출될 수 있어요.',
  revoke_app_access: '권한을 해제하면 해당 앱이 더 이상 계정 데이터에 접근할 수 없어요.',
  security_review: '보안 알림이 왔다면 공식 사이트에서 직접 원인을 확인하는 게 가장 정확해요.',
};

async function reMergeActionItems(sa, enriched) {
  const stepTypes = ACTION_KB[sa.primaryRiskType] || ACTION_KB['security_recommendation'];
  const existing = await prisma.actionItem.findMany({
    where: { serviceAccountId: sa.id },
    orderBy: { order: 'asc' },
  });

  for (const [i, stepType] of stepTypes.entries()) {
    const existingItem = existing.find(item =>
      item.type === stepType ||
      item.type === 'unknown' && existing.indexOf(item) === i
    );

    const enrichedDesc = enriched?.actionDescriptions?.[stepType] || null;

    if (existingItem) {
      await prisma.actionItem.update({
        where: { id: existingItem.id },
        data: {
          type: stepType,
          title: KB_TITLES[stepType] || existingItem.title,
          why: KB_WHY[stepType] || existingItem.why,
          description: enrichedDesc || existingItem.description,
          order: i,
          isRequired: i < 2, // 첫 2개는 required
        },
      });
    }
  }
}

// ── 메인 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== IDly SA 데이터 보강 시작 ===\n');

  if (!SOLAR_API_KEY) {
    console.error('SOLAR_API_KEY 미설정');
    process.exit(1);
  }

  // 1. mbox 파일 파싱
  const manifest = JSON.parse(readFileSync(`${MBOX_DIR}/manifest.json`, 'utf8'));
  console.log(`mbox ${manifest.length}개 파싱 중...`);

  const allSecurityEmails = {}; // serviceName → emails[]
  for (const entry of manifest) {
    console.log(`  [${entry.email}] 파싱 중... (${entry.sizeMb.toFixed(0)}MB)`);
    const emails = await extractSecurityEmails(entry.filePath);
    for (const [service, list] of Object.entries(emails)) {
      if (!allSecurityEmails[service]) allSecurityEmails[service] = [];
      allSecurityEmails[service].push(...list);
      console.log(`    → ${service}: 보안 이메일 ${list.length}개`);
    }
  }

  console.log('\n=== 서비스별 보안 이메일 수 ===');
  for (const [svc, list] of Object.entries(allSecurityEmails)) {
    console.log(`  ${svc}: ${list.length}개`);
  }

  // 2. DB에서 모든 SA 로드
  const sas = await prisma.serviceAccount.findMany({
    where: { status: { notIn: ['dormant', 'skipped'] } },
    include: {
      actionItems: { orderBy: { order: 'asc' } },
      riskEvidences: { orderBy: { receivedAt: 'desc' }, take: 5 },
    },
  });

  console.log(`\n=== ${sas.length}개 SA 보강 시작 ===\n`);

  for (const sa of sas) {
    const displayName = sa.serviceName.split('|')[0].trim().replace(/<[^>]+>/g, '').trim();
    console.log(`\n[${displayName}] (${sa.primaryRiskType})`);

    // 서비스명 정규화
    const serviceKey = Object.keys(allSecurityEmails).find(k =>
      displayName.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(displayName.toLowerCase())
    ) || displayName;

    const emails = allSecurityEmails[serviceKey] || allSecurityEmails[sa.serviceName] || [];
    console.log(`  이메일: ${emails.length}개 매핑됨`);

    // Solar 보강
    let enriched = null;
    try {
      const prompt = buildEnrichPrompt(sa, emails, sa.actionItems);
      enriched = await callSolar(prompt);
      console.log(`  headline: ${enriched?.headline}`);
      console.log(`  summary:  ${enriched?.summary?.slice(0, 60)}...`);
    } catch (e) {
      console.error(`  Solar 실패: ${e.message}`);
    }

    // DB 업데이트 — SA
    if (enriched?.headline) {
      await prisma.serviceAccount.update({
        where: { id: sa.id },
        data: {
          headline: enriched.headline,
          summary: enriched.summary || sa.summary,
          interpretation: enriched.summary || sa.interpretation,
        },
      });
    }

    // DB 업데이트 — ActionItems (type re-merge + description 보강)
    await reMergeActionItems(sa, enriched);

    // 잠깐 대기 (Solar rate limit)
    await new Promise(r => setTimeout(r, 500));
  }

  // 결과 확인
  console.log('\n=== 결과 확인 ===');
  const updated = await prisma.serviceAccount.findMany({
    where: { status: { notIn: ['dormant', 'skipped'] } },
    include: { actionItems: { select: { type: true, title: true } } },
  });
  for (const sa of updated) {
    console.log(`\n${sa.serviceName}: ${sa.headline}`);
    console.log(`  summary: ${sa.summary?.slice(0, 80)}`);
    sa.actionItems.forEach(i => console.log(`  - ${i.type}: ${i.title}`));
  }

  await prisma.$disconnect();
  console.log('\n=== 완료 ===');
}

main().catch(async e => {
  console.error('FATAL:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
