import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeSecurityScore,
  countActionRequired,
  isActiveForHomeMetrics,
} from '../common/domain/metrics';
import { resolveHomeCardNews } from '../common/content/card-news-registry';

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(userId: string, mailAccountId: string = 'all') {
    // 상호 독립 쿼리 4개를 병렬 실행 — 직렬 3왕복 → 1왕복
    const [user, gmailAccounts, latestRun, lastRun] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }),
      this.prisma.gmailAccount.findMany({
        where: {
          userId,
          ...(mailAccountId !== 'all' ? { id: mailAccountId } : {}),
        },
        include: {
          serviceAccounts: {
            include: {
              _count: { select: { riskEvidences: true } },
              actionItems: {
                where: { isRequired: true, status: { in: ['pending', 'failed'] } },
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      }),
      this.prisma.analysisRun.findFirst({
        where: { userId },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.analysisRun.findFirst({
        where: { userId, status: 'completed' },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const backgroundAnalysis =
      latestRun?.status === 'queued' || latestRun?.status === 'scanning'
        ? { status: 'scanning' as const, analysisId: latestRun.id }
        : latestRun?.status === 'failed'
          ? { status: 'failed' as const, analysisId: latestRun.id }
          : { status: 'idle' as const, analysisId: null };

    const allServiceAccounts = gmailAccounts
      .flatMap((ga) =>
        ga.serviceAccounts.map((sa) => ({
          ...sa,
          sourceMailAccount: {
            id: ga.id,
            email: ga.email,
            label: ga.label ?? 'Gmail동',
            role: ga.isPrimary ? 'primary' : 'connected',
          },
        })),
      )
      .filter((sa) => isActiveForHomeMetrics(sa.status));

    const actionRequiredCount = countActionRequired(allServiceAccounts);
    const securityScore = computeSecurityScore(allServiceAccounts);

    const actionRequiredSa = allServiceAccounts
      .filter((sa) => sa.status === 'action_required')
      .sort((a, b) => this.riskWeight(b.riskLevel) - this.riskWeight(a.riskLevel));

    const topRisk = actionRequiredSa[0] ?? null;

    const riskSummary = topRisk
      ? {
          state: 'has_risk' as const,
          title: null,
          serviceAccountId: topRisk.id,
        }
      : {
          state: 'safe' as const,
          title: null,
          serviceAccountId: null,
        };

    const immediateActions = actionRequiredSa.flatMap((sa) => {
      const displayName = sa.displayName ?? sa.serviceName;
      const severity: 'high' | 'medium' = sa.riskLevel === 'high' ? 'high' : 'medium';
      return sa.actionItems.map((item) => ({
        id: item.id,
        serviceAccountId: sa.id,
        severity,
        title: `${displayName} ${item.title}`,
        description: item.description ?? null,
      }));
    });

    return {
      analysisId: lastRun?.id ?? null,
      userName: user?.name ?? null,
      selectedMailAccountId: mailAccountId,
      lastAnalyzedAt: lastRun?.completedAt?.toISOString() ?? null,
      backgroundAnalysis,
      mailAccounts: gmailAccounts.map((ga) => ({
        id: ga.id,
        email: ga.email,
        label: ga.label ?? 'Gmail동',
        role: ga.isPrimary ? 'primary' : 'connected',
        status: ga.status,
        serviceAccountCount: ga.serviceAccounts.filter((sa) =>
          isActiveForHomeMetrics(sa.status),
        ).length,
      })),
      metrics: {
        totalServiceAccounts: allServiceAccounts.length,
        actionRequiredCount,
        securityScore,
      },
      riskSummary,
      serviceAccounts: allServiceAccounts.map((sa) => ({
        id: sa.id,
        sourceMailAccountId: sa.gmailAccountId,
        sourceMailAccount: sa.sourceMailAccount,
        serviceName: sa.serviceName,
        displayName: sa.displayName ?? sa.serviceName,
        iconUrl: sa.iconUrl,
        iconLabel: sa.iconLabel ?? sa.serviceName.charAt(0).toUpperCase(),
        riskLevel: sa.riskLevel,
        status: sa.status,
        primaryRiskType: sa.primaryRiskType,
        evidenceCount: sa._count.riskEvidences,
      })),
      cardNews: resolveHomeCardNews(),
      immediateActions,
    };
  }

  private riskWeight(level: string): number {
    return { high: 3, medium: 2, low: 1, safe: 0 }[level] ?? 0;
  }

}
