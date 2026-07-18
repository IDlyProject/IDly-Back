import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { resolveService, cleanServiceName } from '../common/registry/service-registry';
import { ACTION_KB, getKbSteps } from '../risks/policy/action-kb';
import { assertNoSensitiveData } from '../common/sanitize/secret-detector';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ChatMessageMeta {
  actionList?: {
    items: {
      id: string;
      serviceName: string;
      displayName: string;
      actionTitle: string;
      actionType: string;
      status: string;
      serviceAccountId: string;
    }[];
  };
  externalCard?: {
    label: string;
    title: string;
    subtitle: string | null;
    url: string | null;
    domain: string | null;
    trustLabel: '공식 페이지' | 'IDly 확인 링크';
    ctaLabel: string;
  };
  cardNews?: {
    emoji: string;
    title: string;
    ctaLabel: string;
    url: string;
    badge?: string;
  };
  tip?: string;
  exitCtas?: { id: string; label: string; style: string; enabled: boolean; href?: string }[];
}

interface SolarSignal {
  reply: string;
  showActionList: boolean;
  showLink: boolean;
  targetSaId: string | null;
  actionType: string | null;
  showExitCta: boolean;
}

const ACTION_INTENT_KEYWORDS: { intent: string; terms: string[] }[] = [
  { intent: 'password', terms: ['비밀번호', '패스워드', 'password', 'reset', '재설정', '변경'] },
  { intent: '2fa', terms: ['2단계', '2fa', 'mfa', '인증', '보안 계층'] },
  { intent: 'logout', terms: ['로그아웃', '기기', '세션', '접근 차단'] },
  { intent: 'recovery', terms: ['복구', '이메일', '전화번호'] },
  { intent: 'permission', terms: ['권한', '앱', '연결된 앱', '해제'] },
];

function scoreActionForMessage(
  item: { title: string; description: string | null; externalUrl: string | null; order: number },
  message: string,
): number {
  const haystack = `${item.title} ${item.description ?? ''}`.toLowerCase();
  const normalizedMessage = message.toLowerCase();
  let score = item.externalUrl ? 2 : 0;

  for (const group of ACTION_INTENT_KEYWORDS) {
    const messageHit = group.terms.some((term) => normalizedMessage.includes(term.toLowerCase()));
    if (!messageHit) continue;
    const itemHit = group.terms.some((term) => haystack.includes(term.toLowerCase()));
    if (itemHit) score += 10;
  }

  for (const token of normalizedMessage.split(/\s+/).filter((t) => t.length >= 2)) {
    if (haystack.includes(token)) score += 1;
  }

  return score;
}

function findBestActionForMessage<
  T extends { type: string; title: string; description: string | null; externalUrl: string | null; order: number },
>(items: T[], actionType: string | null, userMessage: string): T | null {
  const exactType = actionType ? items.find((a) => a.type === actionType) : null;
  if (exactType) return exactType;

  const ranked = items
    .map((item) => ({ item, score: scoreActionForMessage(item, userMessage) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.order - b.item.order);

  return ranked[0]?.item ?? null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SecurityChatService {
  private readonly logger = new Logger(SecurityChatService.name);
  private readonly SOLAR_URL = 'https://api.upstage.ai/v1/chat/completions';
  private readonly HISTORY_LIMIT = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async getOrCreateChat(userId: string) {
    const chat = await this.prisma.securityChat.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: {
        messages: {
          orderBy: { createdAt: 'desc' }, // 최신 50개 가져온 뒤 역순으로 반환
          take: 50,
        },
      },
    });

    return this.buildChatResponse(chat.id, [...chat.messages].reverse());
  }

  async sendMessage(userId: string, message: string) {
    const chat = await this.prisma.securityChat.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    // 최근 대화 히스토리 먼저 조회 (유저 메시지 저장 전 — 중복 방지)
    const recentHistory = await this.prisma.securityChatMessage.findMany({
      where: { chatId: chat.id },
      orderBy: { createdAt: 'desc' },
      take: this.HISTORY_LIMIT,
    });
    const historyForLlm = recentHistory
      .reverse()
      .filter((m) => m.role === 'user' || m.type === 'text')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    assertNoSensitiveData(message);

    // 유저 메시지 저장
    const userMsg = await this.prisma.securityChatMessage.create({
      data: { chatId: chat.id, role: 'user', type: 'text', content: message.slice(0, 1000) },
    });

    // 위험도 높은 SA 우선 — safe/resolved/skipped는 컨텍스트 제외, top 10 제한
    const allSa = await this.loadAllSa(userId);

    // Solar 호출
    const signal = await this.callSolar(message, allSa, historyForLlm, userId);

    // assistant 메시지 조립
    const assistantMsgs: { role: string; type: string; content: string; metadata?: ChatMessageMeta }[] = [];

    // 1. 텍스트 응답
    assistantMsgs.push({ role: 'assistant', type: 'text', content: signal.reply });

    // 2. action_list — 전체 또는 특정 SA 조치 목록
    if (signal.showActionList) {
      const targetSa = signal.targetSaId ? allSa.find((s) => s.id === signal.targetSaId) : null;
      const listSa = targetSa ? [targetSa] : allSa.filter((s) => s.status === 'action_required');
      const items = listSa.flatMap((sa) =>
        sa.actionItems
          .filter((a) => a.status === 'pending' || a.status === 'failed')
          .map((a) => ({
            id: a.id,
            serviceName: sa.serviceName,
            displayName: sa.displayName ?? cleanServiceName(sa.serviceName),
            actionTitle: a.title,
            actionType: a.type,
            status: a.status,
            serviceAccountId: sa.id,
          })),
      );
      if (items.length > 0) {
        assistantMsgs.push({
          role: 'assistant',
          type: 'action_list',
          content: '조치가 필요한 항목이에요',
          metadata: { actionList: { items } },
        });
      }
    }

    // 3. official_link — 특정 SA + actionType 기반 링크 카드
    if (signal.showLink && signal.targetSaId) {
      const targetSa = allSa.find((s) => s.id === signal.targetSaId);
      if (targetSa) {
        const registry = resolveService(targetSa.serviceName);
        const displayName = targetSa.displayName ?? cleanServiceName(targetSa.serviceName);
        const kbEntries = getKbSteps(targetSa.primaryRiskType);
        const targetItem = findBestActionForMessage(
          targetSa.actionItems,
          signal.actionType,
          message,
        );
        const kbEntry = targetItem
          ? kbEntries.find((k) => k.stepType === targetItem.type)
          : signal.actionType
            ? kbEntries.find((k) => k.stepType === signal.actionType)
            : kbEntries[0];

        const officialUrlKind = kbEntry?.officialUrlKind ?? null;
        let url: string | null = targetItem?.externalUrl ?? null;
        if (!url && officialUrlKind === 'password') url = registry?.passwordUrl ?? registry?.officialUrl ?? null;
        else if (officialUrlKind === 'security') url = registry?.securityUrl ?? registry?.officialUrl ?? null;
        else if (!url) url = registry?.officialUrl ?? null;

        const actionTitle = targetItem?.title ?? kbEntry?.title ?? displayName;
        const actionSubtitle = targetItem?.description ?? kbEntry?.subtitle ?? null;

        if (url) {
          let domain: string | null = null;
          try { domain = (new URL(url).hostname + new URL(url).pathname).replace(/\/$/, ''); } catch { /* noop */ }

          assistantMsgs.push({
            role: 'assistant',
            type: 'official_link',
            content: `${displayName} ${actionTitle} 페이지로 바로 이동할 수 있어요!`,
            metadata: {
              externalCard: {
                label: `${displayName} 공식`,
                title: actionTitle,
                subtitle: actionSubtitle,
                url,
                domain,
                trustLabel: '공식 페이지',
                ctaLabel: '페이지로 이동',
              },
            },
          });

          // card_news
          if (kbEntry?.cardNews) {
            assistantMsgs.push({
              role: 'assistant',
              type: 'card_news',
              content: kbEntry.cardNews.title,
              metadata: { cardNews: kbEntry.cardNews },
            });
          }
        }
      }
    }

    // 4. exit_cta
    if (signal.showExitCta) {
      const hasMoreAction = allSa.some(
        (s) => s.status === 'action_required' && s.actionItems.some((a) => a.status === 'pending' || a.status === 'failed'),
      );
      assistantMsgs.push({
        role: 'assistant',
        type: 'exit_cta',
        content: '',
        metadata: {
          exitCtas: [
            { id: 'home', label: '홈으로 돌아가기', style: 'home', enabled: true, href: '/home' },
            ...(hasMoreAction ? [{ id: 'next_account', label: '다음 계정 보안 조치 하기', style: 'next_account', enabled: true, href: '/risks' }] : []),
            { id: 'report', label: '보안 리포트 보러 가기', style: 'report', enabled: true, href: '/report' },
          ],
        },
      });
    }

    // 일괄 저장
    const saved = await this.prisma.$transaction(
      assistantMsgs.map((m) =>
        this.prisma.securityChatMessage.create({
          data: {
            chatId: chat.id,
            role: m.role,
            type: m.type,
            content: m.content,
            metadata: m.metadata ? (m.metadata as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        }),
      ),
    );

    return {
      chatId: chat.id,
      userMessage: buildMsgDto(userMsg),
      assistantMessages: saved.map(buildMsgDto),
    };
  }

  // ── Solar ─────────────────────────────────────────────────────────────────

  private async callSolar(
    userMessage: string,
    allSa: Awaited<ReturnType<typeof this.loadAllSa>>,
    history: { role: 'user' | 'assistant'; content: string }[],
    userId: string,
  ): Promise<SolarSignal> {
    const apiKey = this.config.get<string>('SOLAR_API_KEY');
    if (!apiKey) {
      this.logger.warn('SOLAR_API_KEY 미설정 — fallback');
      return { reply: '보안 관련 궁금한 점이 있으시면 공식 사이트의 보안 설정을 확인해보세요.', showActionList: false, showLink: false, targetSaId: null, actionType: null, showExitCta: false };
    }

    const riskLabel = (level: string) => ({ high: '위험', medium: '주의', low: '낮음', safe: '안전' })[level] ?? level;

    const saList = allSa
      .map((sa) => {
        const displayName = sa.displayName ?? cleanServiceName(sa.serviceName);
        const pending = sa.actionItems.filter((a) => a.status === 'pending' || a.status === 'failed');
        const kbEntries = getKbSteps(sa.primaryRiskType);
        const kbSummary = kbEntries.map((k) => `    - [${k.title}] ${k.help ?? k.why}`).join('\n');
        return [
          `- saId: ${sa.id}  서비스: ${displayName}  위험도: ${riskLabel(sa.riskLevel)}  상태: ${sa.status}`,
          sa.headline ? `  감지: ${sa.headline}` : '',
          pending.length > 0 ? `  미완료 조치: ${pending.map((a) => a.title).join(', ')}` : '',
          kbSummary ? `  KB:\n${kbSummary}` : '',
        ].filter(Boolean).join('\n');
      })
      .join('\n\n');

    const systemPrompt = `당신은 IDly 앱의 보안 도우미입니다. 사용자의 전체 계정 보안을 도와드립니다.
말투는 친근하고 간결한 한국어 존댓말, 2-3문장 이내로 답하세요.

[사용자 계정 현황]
${saList || '분석된 계정이 없습니다.'}

[규칙]
- URL이나 링크를 직접 생성하거나 언급하지 마세요. showLink: true 신호를 보내면 시스템이 공식 링크를 첨부합니다.
- 보안과 무관한 질문에는 "보안 관련 내용 위주로 도와드릴 수 있어요"라고 답하세요.
- saId는 반드시 위에 나온 값만 사용하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "reply": "답변 (2-3문장 이내)",
  "showActionList": true 또는 false,
  "showLink": true 또는 false,
  "targetSaId": "saId 또는 null",
  "actionType": "KB stepType 또는 null",
  "showExitCta": true 또는 false
}
showActionList: 조치 목록을 보여주면 도움이 될 때 true.
showLink: 특정 서비스의 공식 페이지 링크가 필요할 때 true (targetSaId 필수).
targetSaId: 특정 서비스에 대한 질문일 때 해당 saId.
actionType: 특정 조치 유형 (change_password, enable_2fa, logout_sessions 등).
showExitCta: 대화를 마무리하거나 다른 페이지로 안내할 때 true.`;

    try {
      const messages = [
        ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
        { role: 'user' as const, content: userMessage },
      ];

      const { data } = await firstValueFrom(
        this.http.post(
          this.SOLAR_URL,
          {
            model: 'solar-pro',
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            response_format: { type: 'json_object' },
            temperature: 0.4,
          },
          {
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            timeout: 15_000,
          },
        ),
      );

      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('empty response');
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const raw = JSON.parse(cleaned) as Partial<SolarSignal> & { targetSaId?: string | null };

      const validSaIds = new Set(allSa.map((s) => s.id));
      const targetSaId = typeof raw.targetSaId === 'string' && validSaIds.has(raw.targetSaId) ? raw.targetSaId : null;

      // actionType을 해당 SA의 실제 KB stepType으로 허용 목록 검증
      let actionType: string | null = null;
      if (typeof raw.actionType === 'string' && targetSaId) {
        const targetSa = allSa.find((s) => s.id === targetSaId);
        if (targetSa) {
          const validTypes = new Set([
            ...getKbSteps(targetSa.primaryRiskType).map((k) => k.stepType),
            ...targetSa.actionItems.map((a) => a.type),
          ]);
          actionType = validTypes.has(raw.actionType) ? raw.actionType : null;
        }
      }

      return {
        reply: typeof raw.reply === 'string' && raw.reply.trim() ? raw.reply.trim() : '보안 관련 궁금한 점이 있으시면 공식 사이트를 확인해보세요.',
        showActionList: raw.showActionList === true,
        showLink: raw.showLink === true && !!targetSaId,
        targetSaId,
        actionType,
        showExitCta: raw.showExitCta === true,
      };
    } catch (err) {
      this.logger.error('Solar 보안 도우미 호출 실패', (err as Error).message);
      return { reply: '죄송해요, 잠시 후 다시 시도해주세요.', showActionList: false, showLink: false, targetSaId: null, actionType: null, showExitCta: false };
    }
  }

  private async loadAllSa(userId: string) {
    // safe/resolved/dormant/skipped 제외, 위험도 높은 순 top 10
    return this.prisma.serviceAccount.findMany({
      where: {
        gmailAccount: { userId },
        status: { in: ['action_required', 'watch'] },
        riskLevel: { in: ['high', 'medium'] },
      },
      include: {
        actionItems: { where: { isRequired: true }, orderBy: { order: 'asc' } },
        riskEvidences: { orderBy: { receivedAt: 'desc' }, take: 2 },
      },
      orderBy: [{ riskLevel: 'asc' }, { createdAt: 'asc' }], // high(asc) = 알파벳순이라 별도 정렬 필요시 수동
      take: 10,
    });
  }

  private buildChatResponse(chatId: string, messages: { id: string; role: string; type: string; content: string; metadata: Prisma.JsonValue; createdAt: Date }[]) {
    return {
      chatId,
      messages: messages.map(buildMsgDto),
    };
  }
}

function buildMsgDto(m: { id: string; role: string; type: string; content: string; metadata: Prisma.JsonValue; createdAt: Date }) {
  return {
    id: m.id,
    role: m.role,
    type: m.type,
    text: m.content,
    metadata: m.metadata ?? undefined,
    createdAt: m.createdAt.toISOString(),
  };
}
