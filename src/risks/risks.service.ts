import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeSecurityScore,
  countActionRequired,
  isActiveForHomeMetrics,
} from '../common/domain/metrics';
import { restoreAccountStatus } from '../common/domain/status';

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
      },
    });

    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    return {
      id: sa.id,
      analysisId: sa.analysisRunId,
      serviceName: sa.serviceName,
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
      evidences: sa.riskEvidences.map((e) => ({
        id: e.id,
        sender: e.sender,
        receivedAt: e.receivedAt?.toISOString() ?? null,
        subject: e.subject,
        summary: e.summary,
        evidenceType: e.riskType,
      })),
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

  async updateActionStatus(
    serviceAccountId: string,
    userId: string,
    body: {
      status: 'resolved' | 'skipped' | 'pending';
      completedStepIds?: string[];
    },
  ) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, gmailAccount: { userId } },
    });
    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    if (body.completedStepIds?.length) {
      await this.prisma.actionItem.updateMany({
        where: { serviceAccountId, id: { in: body.completedStepIds } },
        data: { status: 'done' },
      });
    }

    const updated = await this.prisma.serviceAccount.update({
      where: { id: serviceAccountId },
      data: {
        status: this.nextStatus(body.status, sa.riskLevel),
        resolvedAt: body.status === 'resolved' ? new Date() : null,
        skippedAt: body.status === 'skipped' ? new Date() : null,
      },
    });

    const allAccounts = await this.prisma.serviceAccount.findMany({
      where: { gmailAccount: { userId } },
    });
    const activeAccounts = allAccounts.filter((a) =>
      isActiveForHomeMetrics(a.status),
    );

    await this.invalidateSnapshot(userId);

    return {
      serviceAccountId: updated.id,
      status: updated.status,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      homeDelta: {
        actionRequiredCount: countActionRequired(activeAccounts),
        securityScore: computeSecurityScore(activeAccounts),
      },
    };
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

  private nextStatus(
    requestedStatus: 'resolved' | 'skipped' | 'pending',
    riskLevel: string,
  ): string {
    if (requestedStatus === 'resolved') return 'resolved';
    if (requestedStatus === 'skipped') return 'skipped';
    if (riskLevel === 'high' || riskLevel === 'medium') return 'action_required';
    if (riskLevel === 'low') return 'watch';
    return 'safe';
  }
}
