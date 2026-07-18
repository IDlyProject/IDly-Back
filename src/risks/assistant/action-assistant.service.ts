import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveService, cleanServiceName } from '../../common/registry/service-registry';
import { ACTION_KB, ActionKbEntry, resolveKbUrl, getKbSteps } from '../policy/action-kb';

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

export interface ExternalCard {
  label: string;
  title: string;
  subtitle: string | null;
  url: string | null;
  domain: string | null;
  trustLabel: '공식 페이지' | 'IDly 확인 링크';
  ctaLabel: string;
}

interface ActionMessageMeta {
  externalCard?: ExternalCard;
  feedbackActions?: { actionItemId: string; completeLabel: string; failLabel: string };
  cardNews?: { emoji: string; title: string; ctaLabel: string; url: string; badge?: string };
  actionList?: { title: string; actionIds: string[] };
  exitCtas?: { id: string; label: string; style: string; enabled: boolean; href?: string }[];
  celebration?: { emoji: string; title: string; subtitle: string };
}

type DbSession = {
  id: string;
  serviceAccountId: string;
  status: string;
  activeActionItemId: string | null;
  feedbackEnabled: boolean;
  composerEnabled: boolean;
  composerPlaceholder: string | null;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

type DbMessage = {
  id: string;
  sessionId: string;
  role: string;
  type: string;
  content: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type DbActionItem = {
  id: string;
  serviceAccountId: string;
  type: string;
  title: string;
  description: string | null;
  why: string | null;
  isRequired: boolean;
  externalUrl: string | null;
  order: number;
  status: string;
};

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function domainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname).replace(/\/$/, '');
  } catch {
    return null;
  }
}

function buildExternalCard(
  item: DbActionItem,
  displayName: string,
  registry: ReturnType<typeof resolveService> | null,
): ExternalCard | null {
  const url = item.externalUrl ?? null;
  if (!url && !registry?.officialUrl) return null;
  const resolvedUrl = url ?? registry?.officialUrl ?? null;
  return {
    label: `${displayName} 공식`,
    title: item.title,
    subtitle: item.description,
    url: resolvedUrl,
    domain: domainFromUrl(resolvedUrl),
    trustLabel: '공식 페이지',
    ctaLabel: '페이지로 이동',
  };
}

function buildActionStepDto(item: DbActionItem, displayName: string, registry: ReturnType<typeof resolveService> | null) {
  const selectable = item.status === 'pending' || item.status === 'failed';
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    subtitle: item.description ?? null,
    description: item.description ?? null,
    why: item.why ?? null,
    status: item.status,
    required: item.isRequired,
    isRequired: item.isRequired,
    order: item.order,
    selectable,
    externalCard: buildExternalCard(item, displayName, registry),
    externalUrl: item.externalUrl ?? null,
    officialUrl: item.externalUrl ?? null,
  };
}

function buildMessageDto(msg: DbMessage) {
  return {
    id: msg.id,
    role: msg.role,
    type: msg.type,
    text: msg.content,
    metadata: msg.metadata ?? undefined,
    createdAt: msg.createdAt.toISOString(),
  };
}

function calcProgress(items: DbActionItem[]) {
  const required = items.filter((i) => i.isRequired);
  const doneCount = required.filter((i) => i.status === 'done').length;
  const totalRequired = required.length;
  let label: string | null = null;
  if (totalRequired > 0) {
    label = doneCount >= totalRequired ? '모두 완료' : `${doneCount}/${totalRequired} 완료`;
  }
  return { doneCount, totalRequired, label };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ActionAssistantService {
  private readonly logger = new Logger(ActionAssistantService.name);
  private readonly SOLAR_URL = 'https://api.upstage.ai/v1/chat/completions';

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  // ── 세션 조회 ────────────────────────────────────────────────────────────────

  async getSession(serviceAccountId: string, userId: string) {
    await this.assertOwnership(serviceAccountId, userId);

    const session = await this.prisma.actionSession.findFirst({
      where: {
        serviceAccountId,
        status: { in: ['active', 'completed'] },
      },
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }], // active 우선
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    if (!session) return null;

    const sa = await this.loadSa(serviceAccountId);
    return this.buildSessionResponse(session, session.messages, sa);
  }

  // ── 세션 생성 ────────────────────────────────────────────────────────────────

  async createSession(
    serviceAccountId: string,
    userId: string,
    bootstrapFirstAction = true,
  ) {
    const sa = await this.assertOwnership(serviceAccountId, userId);

    // 기존 active 있으면 idempotent 반환
    const existing = await this.prisma.actionSession.findFirst({
      where: { serviceAccountId, status: 'active' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (existing) return this.buildSessionResponse(existing, existing.messages, sa);

    const items = await this.loadItems(serviceAccountId);
    const registry = resolveService(sa.serviceName);
    const displayName = cleanServiceName(sa.serviceName);

    const firstRequired = items.find((i) => i.isRequired && (i.status === 'pending' || i.status === 'failed'));
    const progress = calcProgress(items);

    // 메시지 빌드
    const messages: { role: string; type: string; content: string; metadata?: ActionMessageMeta }[] = [];

    // 1. risk_intro
    messages.push({
      role: 'assistant',
      type: 'risk_intro',
      content: sa.headline ?? `${displayName} 계정에서 보안 위험이 감지됐어요.`,
      metadata: { } as ActionMessageMeta,
    });

    // 2. action_list
    messages.push({
      role: 'assistant',
      type: 'action_list',
      content: '추천 조치 사항',
      metadata: { actionList: { title: '추천 조치 사항', actionIds: items.map((i) => i.id) } },
    });

    // 3. bootstrap: 첫 required 조치 자동 선택 — user_chip + 조치 메시지 시퀀스
    if (bootstrapFirstAction && firstRequired) {
      messages.push({ role: 'user', type: 'user_chip', content: firstRequired.title });
      this.appendActionMessages(messages, firstRequired, displayName, registry, items);
    }

    // DB에 세션 + 메시지 저장
    const session = await this.prisma.actionSession.create({
      data: {
        serviceAccountId,
        status: 'active',
        activeActionItemId: firstRequired?.id ?? null,
        feedbackEnabled: bootstrapFirstAction && !!firstRequired,
        composerEnabled: false,
        composerPlaceholder: null,
        messages: {
          create: messages.map((m) => ({
            role: m.role,
            type: m.type,
            content: m.content,
            metadata: m.metadata ? (m.metadata as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          })),
        },
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });

    return this.buildSessionResponse(session, session.messages, sa);
  }

  // ── 메시지 전송 ──────────────────────────────────────────────────────────────

  async sendMessage(
    serviceAccountId: string,
    userId: string,
    body: {
      sessionId: string;
      type: 'action_select' | 'user_text' | 'feedback' | 'failure_reason';
      actionItemId?: string;
      message?: string;
      feedbackValue?: 'completed' | 'failed';
      reasonCategory?: string;
    },
  ) {
    const sa = await this.assertOwnership(serviceAccountId, userId);

    const session = await this.prisma.actionSession.findFirst({
      where: { id: body.sessionId, serviceAccountId },
    });
    if (!session) throw new NotFoundException('세션을 찾을 수 없습니다.');
    if (session.status !== 'active') throw new BadRequestException('이미 완료된 세션입니다.');

    const items = await this.loadItems(serviceAccountId);
    const registry = resolveService(sa.serviceName);
    const displayName = cleanServiceName(sa.serviceName);

    let userMessage: ReturnType<typeof buildMessageDto> | null = null;
    const newAssistantMessages: typeof items[0][] = []; // 타입 재사용 회피용 — 아래서 직접 생성
    const assistantMsgs: { role: string; type: string; content: string; metadata?: ActionMessageMeta }[] = [];

    let sessionPatch: Partial<{
      activeActionItemId: string | null;
      feedbackEnabled: boolean;
      composerEnabled: boolean;
      composerPlaceholder: string | null;
      status: string;
      completedAt: Date | null;
    }> = {};

    if (body.type === 'action_select') {
      const item = items.find((i) => i.id === body.actionItemId);
      if (!item) throw new NotFoundException('조치 항목을 찾을 수 없습니다.');

      // user chip
      const userMsg = await this.prisma.actionMessage.create({
        data: { sessionId: session.id, role: 'user', type: 'user_chip', content: item.title },
      });
      userMessage = buildMessageDto(userMsg);

      this.appendActionMessages(assistantMsgs, item, displayName, registry, items);

      sessionPatch = { activeActionItemId: item.id, feedbackEnabled: true, composerEnabled: false, composerPlaceholder: null };

    } else if (body.type === 'feedback') {
      if (!body.feedbackValue) throw new BadRequestException('feedbackValue 필수');
      const targetId = body.actionItemId ?? session.activeActionItemId;
      const item = items.find((i) => i.id === targetId);
      if (!item) throw new NotFoundException('조치 항목을 찾을 수 없습니다.');

      if (body.feedbackValue === 'completed') {
        // user chip
        const userMsg = await this.prisma.actionMessage.create({
          data: { sessionId: session.id, role: 'user', type: 'user_chip', content: '조치를 완료했어요 !' },
        });
        userMessage = buildMessageDto(userMsg);

        // item done + attempt
        await this.prisma.actionItem.update({ where: { id: item.id }, data: { status: 'done' } });
        await this.prisma.actionAttempt.create({
          data: { sessionId: session.id, actionItemId: item.id, status: 'completed' },
        });

        const updatedItems = items.map((i) => i.id === item.id ? { ...i, status: 'done' } : i);
        const remainRequired = updatedItems.filter((i) => i.isRequired && i.status !== 'done');
        const progress = calcProgress(updatedItems);

        if (remainRequired.length === 0) {
          // 전체 완료
          await this.prisma.serviceAccount.update({
            where: { id: serviceAccountId },
            data: { status: 'resolved', resolvedAt: new Date() },
          });
          await this.invalidateSnapshot(userId);

          // 완료된 목록 메시지
          assistantMsgs.push({
            role: 'assistant',
            type: 'action_list',
            content: '모든 조치 완료',
            metadata: { actionList: { title: '모든 조치 완료', actionIds: updatedItems.map((i) => i.id) } },
          });

          // celebration
          const nextSa = await this.findNextActionRequired(userId, serviceAccountId);
          assistantMsgs.push({
            role: 'assistant',
            type: 'celebration',
            content: `${displayName} 계정이 안전해졌어요!`,
            metadata: {
              celebration: {
                emoji: '🎉',
                title: `${displayName} 계정이 안전해졌어요!`,
                subtitle: `${updatedItems.filter((i) => i.isRequired).length}가지 보안 조치를 모두 마쳤어요. 비정상적인 접근이 생기면 바로 알려드릴게요.`,
              },
            },
          });

          // exit CTA
          assistantMsgs.push({
            role: 'assistant',
            type: 'exit_cta',
            content: '',
            metadata: {
              exitCtas: [
                { id: 'home', label: '홈으로 돌아가기', style: 'home', enabled: true, href: '/home' },
                ...(nextSa ? [{ id: 'next_account', label: '다음 계정 보안 조치 하기', style: 'next_account', enabled: true, href: `/service-accounts/${nextSa}` }] : []),
                { id: 'report', label: '보안 리포트 보러 가기', style: 'report', enabled: true, href: '/report' },
              ],
            },
          });

          sessionPatch = {
            status: 'completed',
            completedAt: new Date(),
            activeActionItemId: null,
            feedbackEnabled: false,
            composerEnabled: false,
            composerPlaceholder: null,
          };
        } else {
          // 남은 조치 있음
          const progressText = progress.label ? `완료! ${progress.label}` : '완료!';
          const remainCount = remainRequired.length;
          assistantMsgs.push({
            role: 'assistant',
            type: 'text',
            content: remainCount === 1 ? `${progressText} 이제 마지막 하나만 남았어요.` : `${progressText} 남은 조치 ${remainCount}가지 같이 해요.`,
          });
          assistantMsgs.push({
            role: 'assistant',
            type: 'action_list',
            content: '남은 조치 사항',
            metadata: { actionList: { title: '남은 조치 사항', actionIds: updatedItems.map((i) => i.id) } },
          });

          sessionPatch = { activeActionItemId: null, feedbackEnabled: false, composerEnabled: false, composerPlaceholder: null };
        }

      } else {
        // failed
        const userMsg = await this.prisma.actionMessage.create({
          data: { sessionId: session.id, role: 'user', type: 'user_chip', content: '조치하지 못했어요' },
        });
        userMessage = buildMessageDto(userMsg);

        assistantMsgs.push({
          role: 'assistant',
          type: 'text',
          content: '어떤 부분이 막히셨나요? IDly와 다시 해봐요!',
        });

        sessionPatch = {
          feedbackEnabled: false,
          composerEnabled: true,
          composerPlaceholder: '막힌 부분을 알려주세요',
          activeActionItemId: item.id,
        };
      }

    } else if (body.type === 'failure_reason') {
      const userText = (body.message ?? '').slice(0, 500);
      if (!userText) throw new BadRequestException('message 필수');

      const targetId = body.actionItemId ?? session.activeActionItemId;
      const item = items.find((i) => i.id === targetId);
      if (!item) throw new NotFoundException('조치 항목을 찾을 수 없습니다.');

      // user 텍스트 저장
      const userMsg = await this.prisma.actionMessage.create({
        data: { sessionId: session.id, role: 'user', type: 'text', content: userText },
      });
      userMessage = buildMessageDto(userMsg);

      // attempt 저장 + item failed
      await this.prisma.actionItem.update({ where: { id: item.id }, data: { status: 'failed' } });
      await this.prisma.actionAttempt.create({
        data: {
          sessionId: session.id,
          actionItemId: item.id,
          status: 'failed',
          reason: userText,
          reasonCategory: body.reasonCategory ?? null,
        },
      });

      // KB help 메시지
      const kbEntry = getKbSteps(sa.primaryRiskType).find((k) => k.stepType === item.type);
      const helpText = kbEntry?.help ?? item.description ?? '아래 링크로 다시 시도해보세요!';
      assistantMsgs.push({ role: 'assistant', type: 'text', content: helpText });

      // URL 재제시 + tip + feedback
      this.appendActionMessages(assistantMsgs, item, displayName, registry, items);

      sessionPatch = { composerEnabled: false, composerPlaceholder: null, feedbackEnabled: true, activeActionItemId: item.id };

    } else {
      // user_text — Light RAG chatbot
      const userText = (body.message ?? '').slice(0, 1000).trim();
      if (!userText) throw new BadRequestException('message 필수');

      const userMsg = await this.prisma.actionMessage.create({
        data: { sessionId: session.id, role: 'user', type: 'text', content: userText },
      });
      userMessage = buildMessageDto(userMsg);

      const activeItem = session.activeActionItemId
        ? (items.find((i) => i.id === session.activeActionItemId) ?? null)
        : null;
      const kbEntries = getKbSteps(sa.primaryRiskType);

      const evidences = await this.prisma.riskEvidence.findMany({
        where: { serviceAccountId },
        orderBy: { receivedAt: 'desc' },
        take: 3,
        select: { subject: true },
      });

      const regForKb = registry
        ? {
            officialUrl: registry.officialUrl ?? undefined,
            passwordUrl: registry.passwordUrl ?? undefined,
            securityUrl: registry.securityUrl ?? undefined,
          }
        : null;
      const officialUrl = activeItem
        ? (activeItem.externalUrl ?? resolveKbUrl(regForKb, kbEntries.find((k) => k.stepType === activeItem.type)?.officialUrlKind ?? null))
        : (registry?.officialUrl ?? null);

      const solarResult = await this.callSolarChat(userText, {
        displayName,
        riskType: sa.primaryRiskType,
        headline: sa.headline,
        recentEvidence: evidences.map((e) => e.subject).filter((s): s is string => !!s),
        activeItem,
        kbEntries,
        officialUrl,
      });

      assistantMsgs.push({ role: 'assistant', type: 'text', content: solarResult.reply });

      if (solarResult.showLink) {
        const linkItem = activeItem ?? items.find((i) => i.isRequired && i.status !== 'done') ?? null;
        const card = linkItem
          ? buildExternalCard(linkItem, displayName, registry)
          : (registry?.officialUrl
            ? {
                label: `${displayName} 공식`,
                title: displayName,
                subtitle: null,
                url: registry.officialUrl,
                domain: domainFromUrl(registry.officialUrl),
                trustLabel: '공식 페이지' as const,
                ctaLabel: '페이지로 이동',
              }
            : null);
        if (card) {
          assistantMsgs.push({
            role: 'assistant',
            type: 'official_link',
            content: `${displayName} 공식 페이지로 바로 이동할 수 있어요!`,
            metadata: { externalCard: card },
          });
        }
      }

      if (solarResult.showFeedback && activeItem) {
        assistantMsgs.push({
          role: 'assistant',
          type: 'feedback_actions',
          content: '',
          metadata: {
            feedbackActions: {
              actionItemId: activeItem.id,
              completeLabel: '조치를 완료했어요 !',
              failLabel: '조치하지 못했어요',
            },
          },
        });
      }

      sessionPatch = {};
    }

    // assistant 메시지 일괄 저장
    const savedAssistant = await this.prisma.$transaction(
      assistantMsgs.map((m) =>
        this.prisma.actionMessage.create({
          data: {
            sessionId: session.id,
            role: m.role,
            type: m.type,
            content: m.content,
            metadata: m.metadata ? (m.metadata as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        }),
      ),
    );

    // session 상태 업데이트
    if (Object.keys(sessionPatch).length > 0) {
      await this.prisma.actionSession.update({ where: { id: session.id }, data: sessionPatch });
    }

    const updatedSession = await this.prisma.actionSession.findUniqueOrThrow({ where: { id: session.id } });
    const finalItems = await this.loadItems(serviceAccountId);
    const progress = calcProgress(finalItems);

    // completion 블록
    let completion: object | null = null;
    if (updatedSession.status === 'completed') {
      const nextSa = await this.findNextActionRequired(userId, serviceAccountId);
      completion = {
        celebration: {
          emoji: '🎉',
          title: `${displayName} 계정이 안전해졌어요!`,
          subtitle: `${finalItems.filter((i) => i.isRequired).length}가지 보안 조치를 모두 마쳤어요.`,
        },
        nextServiceAccountId: nextSa,
        exitCtas: [
          { id: 'home', label: '홈으로 돌아가기', style: 'home', enabled: true },
          ...(nextSa ? [{ id: 'next_account', label: '다음 계정 보안 조치 하기', style: 'next_account', enabled: true }] : []),
          { id: 'report', label: '보안 리포트 보러 가기', style: 'report', enabled: true },
        ],
      };
    }

    return {
      sessionId: session.id,
      activeActionItemId: updatedSession.activeActionItemId,
      feedbackEnabled: updatedSession.feedbackEnabled,
      composerEnabled: updatedSession.composerEnabled,
      composerPlaceholder: updatedSession.composerPlaceholder,
      sessionStatus: updatedSession.status,
      readOnly: updatedSession.status !== 'active',
      progress,
      userMessage,
      assistantMessages: savedAssistant.map(buildMessageDto),
      recommendedActions: finalItems.map((i) => buildActionStepDto(i, displayName, registry)),
      completion,
    };
  }

  // ── private 헬퍼 ─────────────────────────────────────────────────────────────

  private appendActionMessages(
    messages: { role: string; type: string; content: string; metadata?: ActionMessageMeta }[],
    item: DbActionItem,
    displayName: string,
    registry: ReturnType<typeof resolveService> | null,
    items: DbActionItem[],
  ) {
    const card = buildExternalCard(item, displayName, registry);

    // official_link
    messages.push({
      role: 'assistant',
      type: 'official_link',
      content: card ? `${item.title} 페이지로 바로 이동할 수 있어요!` : item.description ?? item.title,
      metadata: card ? { externalCard: card } : {},
    });

    // card_news
    const kbForItem = Object.values(ACTION_KB).flat().find((k) => k.stepType === item.type);
    if (kbForItem?.cardNews) {
      messages.push({
        role: 'assistant',
        type: 'card_news',
        content: kbForItem.cardNews.title,
        metadata: { cardNews: kbForItem.cardNews },
      });
    }

    // tip
    const tipText = kbForItem?.tip ?? (items.filter((i) => i.isRequired && i.status !== 'done').length <= 1
      ? '완료하면 모든 보안 조치가 끝나요!'
      : '변경 완료 후 다시 돌아오시면, 나머지 조치도 도와드릴게요!');
    messages.push({ role: 'assistant', type: 'tip', content: tipText });

    // feedback_actions
    messages.push({
      role: 'assistant',
      type: 'feedback_actions',
      content: '',
      metadata: {
        feedbackActions: {
          actionItemId: item.id,
          completeLabel: '조치를 완료했어요 !',
          failLabel: '조치하지 못했어요',
        },
      },
    });
  }

  private async buildSessionResponse(
    session: DbSession,
    messages: DbMessage[],
    sa: Awaited<ReturnType<typeof this.loadSa>>,
  ) {
    const items = await this.loadItems(session.serviceAccountId);
    const registry = resolveService(sa.serviceName);
    const displayName = cleanServiceName(sa.serviceName);
    const progress = calcProgress(items);

    const riskLevelMap: Record<string, string> = { high: '위험', medium: '주의', low: '낮음', safe: '안전' };

    let completion: object | null = null;
    if (session.status === 'completed') {
      const nextSa = await this.findNextActionRequired(
        sa.gmailAccount?.userId ?? '',
        sa.id,
      );
      completion = {
        celebration: {
          emoji: '🎉',
          title: `${displayName} 계정이 안전해졌어요!`,
          subtitle: `${items.filter((i) => i.isRequired).length}가지 보안 조치를 모두 마쳤어요.`,
        },
        nextServiceAccountId: nextSa,
        exitCtas: [
          { id: 'home', label: '홈으로 돌아가기', style: 'home', enabled: true },
          ...(nextSa ? [{ id: 'next_account', label: '다음 계정 보안 조치 하기', style: 'next_account', enabled: true }] : []),
          { id: 'report', label: '보안 리포트 보러 가기', style: 'report', enabled: true },
        ],
      };
    }

    return {
      sessionId: session.id,
      serviceAccountId: session.serviceAccountId,
      sessionStatus: session.status,
      readOnly: session.status !== 'active',
      activeActionItemId: session.activeActionItemId,
      feedbackEnabled: session.feedbackEnabled,
      composerEnabled: session.composerEnabled,
      composerPlaceholder: session.composerPlaceholder,
      title: '지금 바로 조치하기',
      botProfile: { name: '보안 도우미', avatarKey: 'owl' },
      progress,
      riskIntroCard: {
        severity: sa.riskLevel as 'high' | 'medium' | 'low',
        title: sa.headline ?? `${displayName} 계정 보안 위험 감지`,
        description: sa.summary ?? sa.interpretation ?? `${riskLevelMap[sa.riskLevel] ?? ''} 등급 보안 조치가 필요해요.`,
      },
      recommendedActions: items.map((i) => buildActionStepDto(i, displayName, registry)),
      messages: messages.map(buildMessageDto),
      completion,
    };
  }

  private async assertOwnership(serviceAccountId: string, userId: string) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, gmailAccount: { userId } },
      include: { gmailAccount: { select: { userId: true, email: true, label: true } } },
    });
    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');
    return sa;
  }

  private async loadSa(serviceAccountId: string) {
    return this.prisma.serviceAccount.findUniqueOrThrow({
      where: { id: serviceAccountId },
      include: { gmailAccount: { select: { userId: true, email: true, label: true } } },
    });
  }

  private async loadItems(serviceAccountId: string): Promise<DbActionItem[]> {
    return this.prisma.actionItem.findMany({
      where: { serviceAccountId },
      orderBy: { order: 'asc' },
    });
  }

  private async invalidateSnapshot(userId: string) {
    await this.prisma.analysisRun.updateMany({
      where: { userId, status: 'completed' },
      data: { reportSnapshot: { status: 'invalidated' } as unknown as Prisma.InputJsonValue },
    });
  }

  private async findNextActionRequired(userId: string, excludeSaId: string): Promise<string | null> {
    const next = await this.prisma.serviceAccount.findFirst({
      where: {
        id: { not: excludeSaId },
        status: 'action_required',
        gmailAccount: { userId },
        actionItems: { some: { isRequired: true, status: { in: ['pending', 'failed'] } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return next?.id ?? null;
  }

  private async callSolarChat(
    userMessage: string,
    context: {
      displayName: string;
      riskType: string | null;
      headline: string | null;
      recentEvidence: string[];
      activeItem: DbActionItem | null;
      kbEntries: ActionKbEntry[];
      officialUrl: string | null;
    },
  ): Promise<{ reply: string; showLink: boolean; showFeedback: boolean }> {
    const apiKey = this.config.get<string>('SOLAR_API_KEY');
    if (!apiKey) {
      this.logger.warn('SOLAR_API_KEY 미설정 — fallback 응답 사용');
      return { reply: this.kbFallbackReply(context), showLink: false, showFeedback: false };
    }

    const riskTypeLabel: Record<string, string> = {
      new_device_login: '새 기기 로그인 감지',
      password_reset: '비밀번호 재설정 요청',
      verification_code: '인증 코드 요청',
      account_recovery: '계정 복구 시도',
      permission_grant: '앱 권한 부여',
      security_recommendation: '보안 알림',
    };
    const riskLabel = riskTypeLabel[context.riskType ?? ''] ?? (context.riskType ?? '보안 위험');

    const kbSummary = context.kbEntries
      .map(
        (k) =>
          `- [${k.title}] ${k.help ?? k.why}\n  막힐 때: ${k.fallbackAdvice.map((a) => a.message).join(' / ')}`,
      )
      .join('\n');

    const systemPrompt = `당신은 IDly 앱의 보안 도우미입니다. 사용자가 계정 보안 조치를 진행하는 것을 돕습니다.
말투는 친근하고 간결한 한국어 존댓말로 작성하세요. 문장은 짧고 명확하게, 2-3문장 이내로.

[현재 상황]
서비스: ${context.displayName}
감지된 위험: ${riskLabel}
요약: ${context.headline ?? '보안 위험이 감지됐어요'}${context.recentEvidence.length > 0 ? `\n관련 이메일: ${context.recentEvidence.join(', ')}` : ''}${context.activeItem ? `\n현재 진행 중인 조치: ${context.activeItem.title} — ${context.activeItem.why ?? ''}` : ''}

[조치 안내]
${kbSummary}

[규칙]
- URL이나 링크를 직접 생성하거나 제시하지 마세요. 링크가 필요하면 showLink: true로 신호를 보내면 시스템이 공식 링크를 첨부합니다.
- 보안과 무관한 질문에는 "보안 관련 내용 위주로 도와드릴 수 있어요"라고 답하세요.
- 확실하지 않으면 공식 사이트 확인을 권유하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "reply": "사용자에게 전달할 답변 (2-3문장 이내)",
  "showLink": true 또는 false,
  "showFeedback": true 또는 false
}
showLink는 공식 페이지 링크를 함께 보여주면 도움이 될 때 true.
showFeedback은 현재 조치를 시도해볼 수 있는 상태일 때 true.`;

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          this.SOLAR_URL,
          {
            model: 'solar-pro',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.4,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 15_000,
          },
        ),
      );

      const content = data.choices?.[0]?.message?.content;
      if (!content) return { reply: this.kbFallbackReply(context), showLink: false, showFeedback: false };
      const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const raw = JSON.parse(cleaned);
      return {
        reply: typeof raw.reply === 'string' && raw.reply.trim() ? raw.reply.trim() : this.kbFallbackReply(context),
        showLink: raw.showLink === true && !!context.officialUrl,
        showFeedback: raw.showFeedback === true && !!context.activeItem,
      };
    } catch (err) {
      this.logger.error('Solar 채팅 실패', (err as Error).message);
      return { reply: this.kbFallbackReply(context), showLink: false, showFeedback: false };
    }
  }

  private kbFallbackReply(context: { activeItem: DbActionItem | null; kbEntries: ActionKbEntry[] }): string {
    if (context.activeItem) {
      const kb = context.kbEntries.find((k) => k.stepType === context.activeItem!.type);
      if (kb?.fallbackAdvice?.[0]) return kb.fallbackAdvice[0].message;
      if (kb?.help) return kb.help;
    }
    return '보안 관련 궁금한 점이 있으시면 공식 사이트의 보안 설정 메뉴를 확인해보세요.';
  }
}
