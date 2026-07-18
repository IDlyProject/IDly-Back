import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { restoreAccountStatus } from '../common/domain/status';
import { cleanServiceName, resolveService } from '../common/registry/service-registry';
import { ACTION_KB } from './policy/action-kb';

const RISK_BADGE: Record<string, string> = {
  high: '보안 위험',
  medium: '주의 필요',
  low: '낮음',
  safe: '안전',
};

@Injectable()
export class RisksService {
  constructor(private readonly prisma: PrismaService) {}

  async getServiceDetail(serviceAccountId: string, userId: string) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, gmailAccount: { userId } },
      include: {
        gmailAccount: { select: { email: true, label: true } },
        riskEvidences: { orderBy: { receivedAt: 'desc' } },
        actionItems: { orderBy: { order: 'asc' } },
        actionSessions: {
          where: { status: 'active' },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    const registry = resolveService(sa.serviceName);
    const displayName = sa.displayName ?? cleanServiceName(sa.serviceName);

    const recentEvents = sa.riskEvidences.slice(0, 5).map((e) => ({
      id: e.id,
      sender: e.sender,
      receivedAt: e.receivedAt?.toISOString() ?? null,
      subject: e.subject,
      summary: e.summary,
      riskType: e.riskType,
    }));

    const pendingItems = sa.actionItems.filter(
      (a) => a.isRequired && (a.status === 'pending' || a.status === 'failed'),
    );
    const firstPending = pendingItems[0] ?? null;
    const activeSessionId = sa.actionSessions[0]?.id ?? null;

    // Screen 1 카드뉴스 스트립 — 첫 번째 KB cardNews 항목
    const kbFlat = Object.values(ACTION_KB).flat();
    const firstKbWithCard = sa.actionItems
      .map((a) => kbFlat.find((k) => k.stepType === a.type))
      .find((k) => k?.cardNews != null);
    const cardNews = firstKbWithCard?.cardNews ?? null;

    return {
      id: sa.id,
      analysisId: sa.analysisRunId,
      serviceName: sa.serviceName,
      displayName,
      riskBadgeText: RISK_BADGE[sa.riskLevel] ?? sa.riskLevel,
      sourceMailAccount: {
        id: sa.gmailAccountId,
        email: sa.gmailAccount.email,
        label: sa.gmailAccount.label ?? 'Gmail동',
      },
      status: sa.status,
      riskLevel: sa.riskLevel,
      primaryRiskType: sa.primaryRiskType,
      headline: sa.headline,
      summary: sa.summary,
      interpretation: sa.interpretation,
      activeSessionId,
      cardNews,
      primaryCta: firstPending
        ? {
            actionItemId: firstPending.id,
            label: firstPending.title,
            officialUrl: firstPending.externalUrl ?? registry?.officialUrl ?? null,
          }
        : null,
      recentEvents,
      actionItems: sa.actionItems.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        subtitle: a.description ?? null,
        description: a.description,
        why: a.why ?? null,
        required: a.isRequired,
        isRequired: a.isRequired,
        externalUrl: a.externalUrl ?? null,
        officialUrl: a.externalUrl ?? null,
        status: a.status,
        order: a.order,
      })),
      // 하위 호환 — 기존 actionGuide 필드 유지
      actionGuide: {
        title: '이렇게 대응하세요',
        description: sa.interpretation ?? '',
        steps: sa.actionItems.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          required: a.isRequired,
          externalUrl: a.externalUrl,
          status: a.status,
        })),
      },
    };
  }

  async skipAccount(serviceAccountId: string, userId: string) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, gmailAccount: { userId } },
    });
    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    const updated = await this.prisma.serviceAccount.update({
      where: { id: serviceAccountId },
      data: { status: 'skipped', skippedAt: new Date() },
    });

    await this.invalidateSnapshot(userId);
    return { serviceAccountId: updated.id, status: updated.status };
  }

  async setDormant(serviceAccountId: string, userId: string) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, gmailAccount: { userId } },
    });
    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    if (sa.status === 'dormant') {
      return { serviceAccountId, status: 'dormant' };
    }

    await this.prisma.serviceAccount.update({
      where: { id: serviceAccountId },
      data: {
        status: 'dormant',
        dormantAt: new Date(),
        previousStatus: restoreAccountStatus(sa.status),
      },
    });

    await this.invalidateSnapshot(userId);

    return { serviceAccountId, status: 'dormant' };
  }

  async restoreDormant(serviceAccountId: string, userId: string) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: {
        id: serviceAccountId,
        status: 'dormant',
        gmailAccount: { userId },
      },
    });
    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    const restoredStatus = restoreAccountStatus(sa.previousStatus);

    const updated = await this.prisma.serviceAccount.update({
      where: { id: serviceAccountId },
      data: {
        status: restoredStatus,
        dormantAt: null,
        previousStatus: null,
      },
    });

    await this.invalidateSnapshot(userId);

    return { serviceAccountId: updated.id, status: updated.status };
  }

  private async invalidateSnapshot(userId: string) {
    // DbNull 대신 sentinel JSON 사용 — Solar의 DbNull 조건부 patch와 구분하기 위함
    await this.prisma.analysisRun.updateMany({
      where: { userId, status: 'completed' },
      data: { reportSnapshot: { status: 'invalidated' } as unknown as Prisma.InputJsonValue },
    });
  }
}
