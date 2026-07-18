import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveService, cleanServiceName } from '../../common/registry/service-registry';
import { ACTION_KB, ActionKbEntry, resolveKbUrl, getKbSteps } from '../policy/action-kb';
import { assertNoSensitiveData } from '../../common/sanitize/secret-detector';

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
  officialUrlKind?: 'password' | 'security' | 'official' | null,
): ExternalCard | null {
  const registryForKbUrl = registry
    ? {
        officialUrl: registry.officialUrl ?? undefined,
        passwordUrl: registry.passwordUrl ?? undefined,
        securityUrl: registry.securityUrl ?? undefined,
      }
    : null;
  const url = item.externalUrl
    ?? resolveKbUrl(registryForKbUrl, officialUrlKind ?? null)
    ?? registry?.officialUrl
    ?? null;
  if (!url) return null;
  const resolvedUrl = url;
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
  const kbEntry = Object.values(ACTION_KB).flat().find((k) => k.stepType === item.type);
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
    externalCard: buildExternalCard(item, displayName, registry, kbEntry?.officialUrlKind),
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

/** 최근 N개만 로드 — orderBy desc + take 후 시간순 복원 (asc+take는 오래된 쪽만 반환하는 버그) */
const SESSION_MESSAGE_LIMIT = 100;

const sessionMessagesInclude = {
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: SESSION_MESSAGE_LIMIT,
  },
};

function chronologicalMessages<T extends { createdAt: Date }>(messages: T[]): T[] {
  return [...messages].reverse();
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
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
    const sa = await this.assertOwnership(serviceAccountId, userId);

    const activeSession = await this.prisma.actionSession.findFirst({
      where: {
        serviceAccountId,
        status: 'active',
      },
      orderBy: { startedAt: 'desc' },
      include: sessionMessagesInclude,
    });

    if (activeSession) {
      return this.buildSessionResponse(
        activeSession,
        chronologicalMessages(activeSession.messages),
        sa,
      );
    }

    const completedSession = await this.prisma.actionSession.findFirst({
      where: {
        serviceAccountId,
        status: 'completed',
      },
      orderBy: { completedAt: 'desc' },
      include: sessionMessagesInclude,
    });

    if (!completedSession) return null;

    const items = await this.loadItems(serviceAccountId);
    const hasOpenRequiredAction = items.some(
      (i) => i.isRequired && (i.status === 'pending' || i.status === 'failed'),
    );
    if (['action_required', 'watch'].includes(sa.status) && hasOpenRequiredAction) {
      return null;
    }

    return this.buildSessionResponse(
      completedSession,
      chronologicalMessages(completedSession.messages),
      sa,
    );
  }

  // ── 세션 생성 ────────────────────────────────────────────────────────────────

  async createSession(
    serviceAccountId: string,
    userId: string,
    bootstrapFirstAction = true,
  ) {
    const sa = await this.assertOwnership(serviceAccountId, userId);

    // action_required/watch 상태가 아니면 세션 생성 불가 (resolved/skipped/safe)
    if (!['action_required', 'watch'].includes(sa.status)) {
      // 가장 최근 completed 세션이 있으면 readOnly로 반환
      const lastCompleted = await this.prisma.actionSession.findFirst({
        where: { serviceAccountId, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        include: sessionMessagesInclude,
      });
      if (lastCompleted) {
        return this.buildSessionResponse(
          lastCompleted,
          chronologicalMessages(lastCompleted.messages),
          sa,
        );
      }
      throw new BadRequestException('보안 조치가 필요하지 않은 계정입니다.');
    }

    // 기존 active 있으면 idempotent 반환
    const existing = await this.findActiveSession(serviceAccountId);
    if (existing) {
      return this.buildSessionResponse(existing, chronologicalMessages(existing.messages), sa);
    }

    const items = await this.loadItems(serviceAccountId);

    // 조치 항목이 없으면 세션 생성 불가 (분석 미완료)
    if (items.length === 0) throw new BadRequestException('조치 항목이 아직 없습니다. 분석 완료 후 시도해주세요.');
    const registry = resolveService(sa.serviceName);
    const displayName = cleanServiceName(sa.serviceName);

    const firstRequired = items.find((i) => i.isRequired && (i.status === 'pending' || i.status === 'failed'));

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
    // partial unique index(ActionSession_one_active_per_sa) + P2002 재조회로 동시 create 레이스 방어
    try {
      const session = await this.prisma.actionSession.create({
        data: {
          serviceAccountId,
          status: 'active',
          activeActionItemId: firstRequired?.id ?? null,
          feedbackEnabled: bootstrapFirstAction && !!firstRequired,
          composerEnabled: false,
          composerPlaceholder: null,
          messages: {
            create: messages.map((m, i) => ({
              role: m.role,
              type: m.type,
              content: m.content,
              metadata: m.metadata ? (m.metadata as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
              createdAt: new Date(Date.now() + i), // 동일 트랜잭션 내 순서 보장 (+1ms per msg)
            })),
          },
        },
        include: sessionMessagesInclude,
      });

      return this.buildSessionResponse(session, chronologicalMessages(session.messages), sa);
    } catch (err) {
      if (isUniqueViolation(err)) {
        const raced = await this.findActiveSession(serviceAccountId);
        if (raced) {
          return this.buildSessionResponse(raced, chronologicalMessages(raced.messages), sa);
        }
      }
      throw err;
    }
  }

  private async findActiveSession(serviceAccountId: string) {
    return this.prisma.actionSession.findFirst({
      where: { serviceAccountId, status: 'active' },
      include: sessionMessagesInclude,
    });
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
      if (!['pending', 'failed'].includes(item.status)) throw new BadRequestException('선택할 수 없는 조치 항목입니다.');

      // user chip
      const userMsg = await this.prisma.actionMessage.create({
        data: { sessionId: session.id, role: 'user', type: 'user_chip', content: item.title },
      });
      userMessage = buildMessageDto(userMsg);

      this.appendActionMessages(assistantMsgs, item, displayName, registry, items);

      sessionPatch = { activeActionItemId: item.id, feedbackEnabled: true, composerEnabled: false, composerPlaceholder: null };

    } else if (body.type === 'feedback') {
      if (!body.feedbackValue) throw new BadRequestException('feedbackValue 필수');
      if (!session.feedbackEnabled) throw new BadRequestException('완료/실패 피드백 가능 상태가 아닙니다.');
      // body.actionItemId 무시 — active item만 허용
      const targetId = session.activeActionItemId;
      const item = items.find((i) => i.id === targetId);
      if (!item) throw new NotFoundException('조치 항목을 찾을 수 없습니다.');

      if (body.feedbackValue === 'completed') {
        if (item.status === 'done') throw new BadRequestException('이미 완료된 조치 항목입니다.');

        // user chip
        const userMsg = await this.prisma.actionMessage.create({
          data: { sessionId: session.id, role: 'user', type: 'user_chip', content: '조치를 완료했어요 !' },
        });
        userMessage = buildMessageDto(userMsg);

        const updatedItems = items.map((i) => i.id === item.id ? { ...i, status: 'done' } : i);
        const remainRequired = updatedItems.filter((i) => i.isRequired && i.status !== 'done');
        const progress = calcProgress(updatedItems);

        if (remainRequired.length === 0) {
          // 전체 완료 — 트랜잭션으로 묶음
          await this.prisma.$transaction([
            this.prisma.actionItem.update({ where: { id: item.id }, data: { status: 'done' } }),
            this.prisma.actionAttempt.create({ data: { sessionId: session.id, actionItemId: item.id, status: 'completed' } }),
            this.prisma.serviceAccount.update({ where: { id: serviceAccountId }, data: { status: 'resolved', resolvedAt: new Date() } }),
          ]);
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
          await this.prisma.$transaction([
            this.prisma.actionItem.update({ where: { id: item.id }, data: { status: 'done' } }),
            this.prisma.actionAttempt.create({ data: { sessionId: session.id, actionItemId: item.id, status: 'completed' } }),
          ]);

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
            // dynamic.html makeRemainingList: 전체(완료 포함) 렌더, done은 회색 체크로 표시
            metadata: { actionList: { title: '남은 조치 사항', actionIds: updatedItems.filter((i) => i.isRequired).map((i) => i.id) } },
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
      if (!session.composerEnabled) throw new BadRequestException('실패 사유 입력 상태가 아닙니다.');
      const userText = (body.message ?? '').slice(0, 500);
      if (!userText) throw new BadRequestException('message 필수');
      assertNoSensitiveData(userText);

      // body.actionItemId 무시 — activeActionItemId만 허용 (dynamic.html: 직전 "못했어요" 조치에만 사유 귀속)
      const targetId = session.activeActionItemId;
      const item = items.find((i) => i.id === targetId);
      if (!item) throw new NotFoundException('조치 항목을 찾을 수 없습니다.');

      // user 텍스트 저장
      const userMsg = await this.prisma.actionMessage.create({
        data: { sessionId: session.id, role: 'user', type: 'text', content: userText },
      });
      userMessage = buildMessageDto(userMsg);

      // attempt 저장 + item failed — 트랜잭션으로 묶음
      await this.prisma.$transaction([
        this.prisma.actionItem.update({ where: { id: item.id }, data: { status: 'failed' } }),
        this.prisma.actionAttempt.create({
          data: {
            sessionId: session.id,
            actionItemId: item.id,
            status: 'failed',
            reason: userText,
            reasonCategory: body.reasonCategory ?? null,
          },
        }),
      ]);

      // KB help 메시지
      const kbEntry = getKbSteps(sa.primaryRiskType).find((k) => k.stepType === item.type);
      const helpText = kbEntry?.help ?? item.description ?? '아래 링크로 다시 시도해보세요!';
      assistantMsgs.push({ role: 'assistant', type: 'text', content: helpText });

      // URL 재제시 + tip + feedback
      this.appendActionMessages(assistantMsgs, item, displayName, registry, items);

      sessionPatch = { composerEnabled: false, composerPlaceholder: null, feedbackEnabled: true, activeActionItemId: item.id };

    } else {
      // Phase 1: user_text 미지원 — composer는 failure_reason 전용
      // dynamic.html handleSend()는 항상 실패 사유 플로우만 처리
      throw new BadRequestException('user_text 타입은 지원되지 않습니다. failure_reason을 사용해주세요.');
    }

    // assistant 메시지 일괄 저장 (+1ms offset으로 동일 트랜잭션 내 순서 보장)
    const msgBaseTime = Date.now();
    const savedAssistant = await this.prisma.$transaction(
      assistantMsgs.map((m, i) =>
        this.prisma.actionMessage.create({
          data: {
            sessionId: session.id,
            role: m.role,
            type: m.type,
            content: m.content,
            metadata: m.metadata ? (m.metadata as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
            createdAt: new Date(msgBaseTime + i),
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
          { id: 'home', label: '홈으로 돌아가기', style: 'home', enabled: true, href: '/home' },
          ...(nextSa ? [{ id: 'next_account', label: '다음 계정 보안 조치 하기', style: 'next_account', enabled: true, href: `/service-accounts/${nextSa}` }] : []),
          { id: 'report', label: '보안 리포트 보러 가기', style: 'report', enabled: true, href: '/report' },
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
    const kbForItem = Object.values(ACTION_KB).flat().find((k) => k.stepType === item.type);
    const card = buildExternalCard(item, displayName, registry, kbForItem?.officialUrlKind);

    // official_link — card가 있을 때만 push
    if (card) {
      messages.push({
        role: 'assistant',
        type: 'official_link',
        content: `${item.title} 페이지로 바로 이동할 수 있어요!`,
        metadata: { externalCard: card },
      });
    }

    // card_news
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
    if (
      session.status === 'completed'
      && progress.totalRequired > 0
      && progress.doneCount >= progress.totalRequired
    ) {
      const gmailUserId = sa.gmailAccount?.userId;
      if (!gmailUserId) throw new Error('gmailAccount 관계 로드 실패 — serviceAccount에 gmailAccount가 없습니다.');
      const nextSa = await this.findNextActionRequired(
        gmailUserId,
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
      composerPlaceholder: session.composerEnabled
        ? (session.composerPlaceholder ?? '막힌 부분을 알려주세요')
        : '메시지를 입력하세요',
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
