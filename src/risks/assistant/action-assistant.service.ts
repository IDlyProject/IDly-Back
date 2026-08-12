import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveService, cleanServiceName } from '../../common/registry/service-registry';
import {
  ActionKbEntry,
  resolveKbUrl,
  matchKbEntry,
  resolveStepHelp,
  noOfficialLinkGuidance,
  planKbActionMerge,
  stepTypeToEmoji,
} from '../policy/action-kb';
import { assertNoSensitiveData } from '../../common/sanitize/secret-detector';
import {
  redactForLlmContext,
  redactServiceLabel,
  sanitizeLlmOutput,
} from '../../common/sanitize/text-safety';

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
  // 액션/LLM 산출물의 externalUrl을 "공식" 카드로 신뢰하지 않는다.
  // 사용자에게 노출하는 링크는 서비스 레지스트리 화이트리스트에서만 고른다.
  const url = resolveKbUrl(registryForKbUrl, officialUrlKind ?? null)
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

function resolveItemKb(
  item: { type?: string | null; title?: string | null },
  riskType: string | null,
): ActionKbEntry | null {
  return matchKbEntry(riskType, item);
}

function buildActionStepDto(
  item: DbActionItem,
  displayName: string,
  registry: ReturnType<typeof resolveService> | null,
  riskType: string | null = null,
) {
  const selectable = item.status === 'pending' || item.status === 'failed';
  const kbEntry = resolveItemKb(item, riskType);
  const card = buildExternalCard(item, displayName, registry, kbEntry?.officialUrlKind);
  const resolvedType = item.type !== 'unknown' ? item.type : (kbEntry?.stepType ?? item.type);
  return {
    id: item.id,
    type: resolvedType,
    title: item.title,
    subtitle: item.description ?? null,
    description: item.description ?? null,
    why: item.why ?? kbEntry?.why ?? null,
    status: item.status,
    required: item.isRequired,
    isRequired: item.isRequired,
    order: item.order,
    selectable,
    iconEmoji: stepTypeToEmoji(resolvedType),
    externalCard: card,
    externalUrl: card?.url ?? null,
    officialUrl: card?.url ?? null,
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

export function calcProgress(items: DbActionItem[]) {
  const visibleItems = items.filter((i) => i.status !== 'skipped');
  const doneCount = visibleItems.filter((i) => i.status === 'done').length;
  // 응답 필드명은 하위 호환을 위해 유지하지만, 진행률은 화면에 노출된 전체 조치 기준이다.
  const totalRequired = visibleItems.length;
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
    const hasOpenAction = items.some(
      (i) => i.status === 'pending' || i.status === 'failed',
    );
    if (hasOpenAction) {
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
    bootstrapFirstAction = false,
  ) {
    const sa = await this.assertOwnership(serviceAccountId, userId);
    const existingItems = await this.loadItems(serviceAccountId);
    const hasOpenAction = existingItems.some(
      (item) => item.status === 'pending' || item.status === 'failed',
    );

    // 과거 필수 조치 기준으로 resolved된 계정도 미완료 조치가 있으면 이어서 진행한다.
    if (!['action_required', 'watch'].includes(sa.status) && !hasOpenAction) {
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

    if (!['action_required', 'watch'].includes(sa.status) && hasOpenAction) {
      await this.prisma.serviceAccount.update({
        where: { id: serviceAccountId },
        data: { status: 'action_required', resolvedAt: null },
      });
    }

    // 기존 active 있으면 idempotent 반환
    const existing = await this.findActiveSession(serviceAccountId);
    if (existing) {
      return this.buildSessionResponse(existing, chronologicalMessages(existing.messages), sa);
    }

    // 세션 시작 전 KB merge — 분석 없이도 unknown/type/why/URL 보강 (enrich 스크립트 비의존)
    await this.ensureKbMergedItems(serviceAccountId, sa.primaryRiskType, sa.serviceName);

    const items = await this.loadItems(serviceAccountId);

    // 조치 항목이 없으면 세션 생성 불가 (분석 미완료)
    if (items.length === 0) throw new BadRequestException('조치 항목이 아직 없습니다. 분석 완료 후 시도해주세요.');
    const registry = resolveService(sa.serviceName);
    const displayName = sa.displayName ?? cleanServiceName(sa.serviceName);

    const firstOpenItem = items.find((i) => i.status === 'pending' || i.status === 'failed');

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

    // 3. bootstrap: 첫 미완료 조치 자동 선택 — user_chip + 조치 메시지 시퀀스
    if (bootstrapFirstAction && firstOpenItem) {
      messages.push({ role: 'user', type: 'user_chip', content: firstOpenItem.title });
      this.appendActionMessages(messages, firstOpenItem, displayName, registry, items, sa.primaryRiskType);
    } else {
      // 자동 선택 없는 경우 — Figma 설계: 조치 선택 유도 텍스트
      messages.push({ role: 'assistant', type: 'text', content: '이 조치들 중 하나부터 시작해 보세요.' });
    }

    // DB에 세션 + 메시지 저장
    // partial unique index(ActionSession_one_active_per_sa) + P2002 재조회로 동시 create 레이스 방어
    try {
      const session = await this.prisma.actionSession.create({
        data: {
          serviceAccountId,
          status: 'active',
          activeActionItemId: firstOpenItem?.id ?? null,
          feedbackEnabled: bootstrapFirstAction && !!firstOpenItem,
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
    const registry = resolveService(sa.serviceName, sa.displayName);
    const displayName = sa.displayName ?? cleanServiceName(sa.serviceName);

    let userMessage: ReturnType<typeof buildMessageDto> | null = null;
    const assistantMsgs: { role: string; type: string; content: string; metadata?: ActionMessageMeta }[] = [];
    let completedAction: { itemId: string; resolvesAccount: boolean } | null = null;

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

      this.appendActionMessages(assistantMsgs, item, displayName, registry, items, sa.primaryRiskType);

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

        const updatedItems = items.map((i) => i.id === item.id ? { ...i, status: 'done' } : i);
        const remainingItems = updatedItems.filter(
          (i) => i.status !== 'done' && i.status !== 'skipped',
        );
        const progress = calcProgress(updatedItems);

        if (remainingItems.length === 0) {
          // 완료된 목록 메시지
          assistantMsgs.push({
            role: 'assistant',
            type: 'action_list',
            content: '모든 조치 완료',
            metadata: {
              actionList: {
                title: '모든 조치 완료',
                actionIds: updatedItems
                  .filter((i) => i.status !== 'skipped')
                  .map((i) => i.id),
              },
            },
          });

          // celebration
          assistantMsgs.push({
            role: 'assistant',
            type: 'celebration',
            content: `${displayName} 계정이 안전해졌어요!`,
            metadata: {
              celebration: {
                emoji: '🎉',
                title: `${displayName} 계정이 안전해졌어요!`,
                subtitle: `${updatedItems.filter((i) => i.status !== 'skipped').length}가지 보안 조치를 모두 마쳤어요. 비정상적인 접근이 생기면 바로 알려드릴게요.`,
              },
            },
          });

          // 카드뉴스는 개별 조치 도중 끼워 넣지 않고, 모든 필수 조치를
          // 완료한 뒤 계정에 맞는 콘텐츠를 한 번만 노출한다.
          const completionCardNews = updatedItems
            .map((actionItem) => matchKbEntry(sa.primaryRiskType, actionItem)?.cardNews)
            .find((cardNews) => cardNews != null);
          if (completionCardNews) {
            assistantMsgs.push({
              role: 'assistant',
              type: 'card_news',
              content: completionCardNews.title,
              metadata: { cardNews: completionCardNews },
            });
          }

          // exit CTA
          assistantMsgs.push({
            role: 'assistant',
            type: 'exit_cta',
            content: '',
            metadata: {
              exitCtas: [
                { id: 'home', label: '홈으로 돌아가기', style: 'home', enabled: true, href: '/home' },
                {
                  id: 'account_report',
                  label: '계정 리포트 보러 가기',
                  style: 'account',
                  enabled: true,
                  href: `/account/${serviceAccountId}`,
                },
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
          completedAction = { itemId: item.id, resolvesAccount: true };
        } else {
          const progressText = progress.label ? `완료! ${progress.label}` : '완료!';
          const remainCount = remainingItems.length;
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
            metadata: {
              actionList: {
                title: '남은 조치 사항',
                actionIds: updatedItems
                  .filter((i) => i.status !== 'skipped')
                  .map((i) => i.id),
              },
            },
          });

          sessionPatch = { activeActionItemId: null, feedbackEnabled: false, composerEnabled: false, composerPlaceholder: null };
          completedAction = { itemId: item.id, resolvesAccount: false };
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

      // KB help — type unknown이어도 title 매칭 + 현재 서비스 경로만 노출
      const kbEntry = matchKbEntry(sa.primaryRiskType, item);
      const linkProbe = kbEntry
        ? buildExternalCard(item, displayName, registry, kbEntry.officialUrlKind)
        : buildExternalCard(item, displayName, registry, null);
      const helpText = kbEntry
        ? resolveStepHelp(kbEntry, {
            displayName,
            hasOfficialUrl: !!linkProbe?.url,
          })
        : (item.description ??
          `${(registry?.officialUrl || registry?.passwordUrl || registry?.securityUrl) ? displayName : '해당 서비스'} 공식 사이트 설정·보안 메뉴에서 「${item.title}」을(를) 찾아 다시 시도해 보세요.`);
      assistantMsgs.push({ role: 'assistant', type: 'text', content: helpText });

      // URL 재제시 + tip + feedback
      this.appendActionMessages(assistantMsgs, item, displayName, registry, items, sa.primaryRiskType);

      sessionPatch = { composerEnabled: false, composerPlaceholder: null, feedbackEnabled: true, activeActionItemId: item.id };

    } else {
      // Phase 1: user_text 미지원 — composer는 failure_reason 전용
      // dynamic.html handleSend()는 항상 실패 사유 플로우만 처리
      throw new BadRequestException('user_text 타입은 지원되지 않습니다. failure_reason을 사용해주세요.');
    }

    // 완료 피드백은 조치/계정/세션/메시지를 하나의 트랜잭션에서 commit한다.
    const msgBaseTime = Date.now();
    let savedAssistant: DbMessage[];
    if (completedAction) {
      const persisted = await this.prisma.$transaction(async (tx) => {
        const claimedSession = await tx.actionSession.updateMany({
          where: {
            id: session.id,
            status: 'active',
            feedbackEnabled: true,
            activeActionItemId: completedAction.itemId,
          },
          data: sessionPatch,
        });
        if (claimedSession.count !== 1) {
          throw new BadRequestException('이미 처리된 조치 요청입니다.');
        }

        const claimedAction = await tx.actionItem.updateMany({
          where: {
            id: completedAction.itemId,
            status: { in: ['pending', 'failed'] },
          },
          data: { status: 'done' },
        });
        if (claimedAction.count !== 1) {
          throw new BadRequestException('이미 완료된 조치 항목입니다.');
        }

        await tx.actionAttempt.create({
          data: {
            sessionId: session.id,
            actionItemId: completedAction.itemId,
            status: 'completed',
          },
        });

        if (completedAction.resolvesAccount) {
          await tx.serviceAccount.update({
            where: { id: serviceAccountId },
            data: { status: 'resolved', resolvedAt: new Date() },
          });
          await tx.analysisRun.updateMany({
            where: { userId, status: 'completed' },
            data: {
              reportSnapshot: {
                status: 'invalidated',
              } as unknown as Prisma.InputJsonValue,
            },
          });
        }

        const createdUser = await tx.actionMessage.create({
          data: {
            sessionId: session.id,
            role: 'user',
            type: 'user_chip',
            content: '조치를 완료했어요 !',
            createdAt: new Date(msgBaseTime),
          },
        });
        const createdAssistant: DbMessage[] = [];
        for (const [index, message] of assistantMsgs.entries()) {
          createdAssistant.push(
            await tx.actionMessage.create({
              data: {
                sessionId: session.id,
                role: message.role,
                type: message.type,
                content: message.content,
                metadata: message.metadata
                  ? (message.metadata as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                createdAt: new Date(msgBaseTime + index + 1),
              },
            }),
          );
        }
        return { createdUser, createdAssistant };
      });
      userMessage = buildMessageDto(persisted.createdUser);
      savedAssistant = persisted.createdAssistant;
    } else {
      savedAssistant = await this.prisma.$transaction(
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

      if (Object.keys(sessionPatch).length > 0) {
        await this.prisma.actionSession.update({ where: { id: session.id }, data: sessionPatch });
      }
    }

    const updatedSession = await this.prisma.actionSession.findUniqueOrThrow({ where: { id: session.id } });
    const finalItems = await this.loadItems(serviceAccountId);
    const progress = calcProgress(finalItems);

    // completion 블록
    let completion: object | null = null;
    if (updatedSession.status === 'completed') {
      completion = {
        celebration: {
          emoji: '🎉',
          title: `${displayName} 계정이 안전해졌어요!`,
          subtitle: `${finalItems.filter((i) => i.status !== 'skipped').length}가지 보안 조치를 모두 마쳤어요.`,
        },
      };
    }

    return {
      sessionId: session.id,
      activeActionItemId: updatedSession.activeActionItemId,
      feedbackEnabled: updatedSession.feedbackEnabled,
      composerEnabled: updatedSession.composerEnabled,
      composerPlaceholder: updatedSession.composerEnabled
        ? (updatedSession.composerPlaceholder ?? '막힌 부분을 알려주세요')
        : '조치가 막히면 아래 버튼을 눌러주세요',
      sessionStatus: updatedSession.status,
      readOnly: updatedSession.status !== 'active',
      progress,
      userMessage,
      assistantMessages: savedAssistant.map(buildMessageDto),
      recommendedActions: finalItems.map((i) =>
        buildActionStepDto(i, displayName, registry, sa.primaryRiskType),
      ),
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
    riskType: string | null = null,
  ) {
    const kbForItem = matchKbEntry(riskType, item);
    const card = buildExternalCard(item, displayName, registry, kbForItem?.officialUrlKind);

    // official_link — URL 있으면 카드, 없으면 일반화 안내 텍스트 (registry 밖 SA 대응)
    if (card) {
      messages.push({
        role: 'assistant',
        type: 'official_link',
        content: `${item.title} 페이지로 바로 이동할 수 있어요!`,
        metadata: { externalCard: card },
      });
    } else {
      // 알려진 공식 URL이 없는 서비스(개인 계정 레이블, registry 미등록 등)는 중립 레이블 사용
      const hasKnownUrl = !!(registry?.officialUrl || registry?.passwordUrl || registry?.securityUrl);
      const safeLabel = hasKnownUrl ? displayName : '해당 서비스';
      messages.push({
        role: 'assistant',
        type: 'text',
        content: noOfficialLinkGuidance(safeLabel, item.title),
      });
    }

    // tip
    const tipText = kbForItem?.tip ?? (items.filter((i) =>
      i.status === 'pending' || i.status === 'failed',
    ).length <= 1
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
    const registry = resolveService(sa.serviceName, sa.displayName);
    const displayName = sa.displayName ?? cleanServiceName(sa.serviceName);
    const progress = calcProgress(items);

    const riskLevelMap: Record<string, string> = { high: '위험', medium: '주의', low: '낮음', safe: '안전' };

    let completion: object | null = null;
    if (
      session.status === 'completed'
      && progress.totalRequired > 0
      && progress.doneCount >= progress.totalRequired
    ) {
      completion = {
        celebration: {
          emoji: '🎉',
          title: `${displayName} 계정이 안전해졌어요!`,
          subtitle: `${items.filter((i) => i.status !== 'skipped').length}가지 보안 조치를 모두 마쳤어요.`,
        },
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
        : '조치가 막히면 아래 버튼을 눌러주세요',
      title: '지금 바로 조치하기',
      botProfile: { name: '보안 도우미', avatarKey: 'owl' },
      progress,
      riskIntroCard: {
        severity: sa.riskLevel as 'high' | 'medium' | 'low',
        title: sa.headline ?? `${displayName} 계정 보안 위험 감지`,
        description: sa.summary ?? sa.interpretation ?? `${riskLevelMap[sa.riskLevel] ?? ''} 등급 보안 조치가 필요해요.`,
      },
      recommendedActions: items
        .filter((i) => i.status !== 'skipped')
        .map((i) =>
        buildActionStepDto(i, displayName, registry, sa.primaryRiskType),
      ),
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

  /**
   * 세션 생성 직전 KB merge.
   * analysis 재실행 없이도 type/why/URL을 보강해 cold·unknown 데이터를 일반화한다.
   */
  private async ensureKbMergedItems(
    serviceAccountId: string,
    primaryRiskType: string | null,
    serviceName: string,
  ) {
    if (!primaryRiskType) return;
    const existing = await this.loadItems(serviceAccountId);
    // 이미 충분히 보강됐으면 스킵 (done 제외 전부 type 유효 + why 있음)
    const open = existing.filter((a) => a.status !== 'done' && a.status !== 'skipped');
    const needs = open.some((a) => !a.type || a.type === 'unknown' || !a.why);
    // URL 없는 password 스텝도 registry 재적용
    const registry = resolveService(serviceName);
    const plan = planKbActionMerge(existing, primaryRiskType, registry);
    if (!needs && plan.creates.length === 0 && plan.skipIds.length === 0) {
      // 그래도 externalUrl 보강 가능한 update는 적용
      const urlOnly = plan.updates.filter((u) => {
        const prev = existing.find((e) => e.id === u.id);
        return prev && !prev.externalUrl && u.externalUrl;
      });
      for (const u of urlOnly) {
        await this.prisma.actionItem.update({
          where: { id: u.id },
          data: { externalUrl: u.externalUrl },
        });
      }
      return;
    }

    for (const u of plan.updates) {
      await this.prisma.actionItem.update({
        where: { id: u.id },
        data: {
          type: u.type,
          title: u.title,
          why: u.why,
          description: u.description,
          isRequired: u.isRequired,
          externalUrl: u.externalUrl,
          order: u.order,
        },
      });
    }
    for (const c of plan.creates) {
      await this.prisma.actionItem.create({
        data: {
          serviceAccountId,
          type: c.type,
          title: c.title,
          description: c.description,
          why: c.why,
          isRequired: c.isRequired,
          externalUrl: c.externalUrl,
          order: c.order,
          status: c.status,
        },
      });
    }
    if (plan.skipIds.length > 0) {
      await this.prisma.actionItem.updateMany({
        where: { id: { in: plan.skipIds } },
        data: { status: 'skipped' },
      });
    }
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

    const safeDisplay = redactServiceLabel(context.displayName);
    const safeHeadline = redactForLlmContext(context.headline, 120);
    const safeEvidence = context.recentEvidence
      .map((e) => redactForLlmContext(e, 60))
      .filter(Boolean)
      .slice(0, 3);
    const safeActive = context.activeItem
      ? `${redactForLlmContext(context.activeItem.title, 40)} — ${redactForLlmContext(context.activeItem.why, 80)}`
      : '';

    const systemPrompt = `당신은 IDly 앱의 보안 도우미입니다. 사용자가 계정 보안 조치를 진행하는 것을 돕습니다.
말투는 친근하고 간결한 한국어 존댓말로 작성하세요. 문장은 짧고 명확하게, 2-3문장 이내로.

[현재 상황]
서비스: ${safeDisplay}
감지된 위험: ${riskLabel}
요약: ${safeHeadline || '보안 위험이 감지됐어요'}${safeEvidence.length > 0 ? `\n관련 신호: ${safeEvidence.join('; ')}` : ''}${safeActive ? `\n현재 진행 중인 조치: ${safeActive}` : ''}

[조치 안내]
${kbSummary}

[규칙]
- URL이나 링크를 직접 생성하거나 제시하지 마세요. 링크가 필요하면 showLink: true로 신호를 보내면 시스템이 공식 링크를 첨부합니다.
- 보안과 무관한 질문에는 "보안 관련 내용 위주로 도와드릴 수 있어요"라고 답하세요.
- 확실하지 않으면 공식 사이트 확인을 권유하세요.
- 이메일 주소, UUID, 전화번호, 인증코드, 비밀번호를 절대 출력하지 마세요.

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
      const replyRaw =
        typeof raw.reply === 'string' && raw.reply.trim()
          ? raw.reply.trim()
          : this.kbFallbackReply(context);
      return {
        reply: sanitizeLlmOutput(replyRaw),
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
