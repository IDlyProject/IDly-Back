import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeSecurityScore, isActiveForHomeMetrics } from '../common/domain/metrics';
import { ReportSnapshot } from '../common/solar/solar.service';

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(userId: string) {
    const latestRun = await this.prisma.analysisRun.findFirst({
      where: { userId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
    });

    const gmailAccounts = await this.prisma.gmailAccount.findMany({
      where: { userId },
      include: {
        serviceAccounts: {
          include: {
            riskEvidences: { orderBy: { receivedAt: 'desc' }, take: 5 },
            actionItems: { orderBy: { order: 'asc' } },
          },
        },
      },
    });

    const allAccounts = gmailAccounts.flatMap((ga) =>
      ga.serviceAccounts.map((sa) => ({ ...sa, gmailEmail: ga.email, gmailLabel: ga.label })),
    );

    const activeAccounts = allAccounts.filter((sa) => isActiveForHomeMetrics(sa.status));
    const securityScore = computeSecurityScore(activeAccounts);

    const snapshot = latestRun?.reportSnapshot as ReportSnapshot | null;

    const services = activeAccounts
      .filter((sa) => sa.riskLevel !== 'safe')
      .sort((a, b) => {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
        return (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3);
      })
      .map((sa) => {
        const snapshotRec = snapshot?.recommendations?.find(
          (r) => r.serviceAccountId === sa.id,
        );
        return {
          id: sa.id,
          serviceName: sa.serviceName,
          iconUrl: sa.iconUrl ?? null,
          iconLabel: sa.iconLabel ?? sa.serviceName[0]?.toUpperCase() ?? '?',
          riskLevel: sa.riskLevel,
          status: sa.status,
          primaryRiskType: sa.primaryRiskType ?? null,
          headline: snapshotRec?.headline ?? sa.headline ?? null,
          reason: snapshotRec?.reason ?? sa.interpretation ?? null,
          sourceMailAccount: { email: sa.gmailEmail, label: sa.gmailLabel ?? 'Gmail동' },
          evidences: sa.riskEvidences.map((e) => {
            const snapshotEv = snapshot?.riskEvents?.find((ev) => ev.evidenceId === e.id);
            return {
              id: e.id,
              title: snapshotEv?.title ?? e.subject ?? null,
              description: snapshotEv?.description ?? e.summary ?? null,
              riskType: e.riskType,
              receivedAt: e.receivedAt?.toISOString() ?? null,
            };
          }),
          actionItems: sa.actionItems.map((a) => ({
            id: a.id,
            title: a.title,
            isRequired: a.isRequired,
            status: a.status,
            externalUrl: a.externalUrl ?? null,
          })),
        };
      });

    return {
      securityScore,
      scoreDescription:
        snapshot?.scoreDescription ?? this.fallbackScoreDescription(securityScore),
      analyzedAt: latestRun?.completedAt?.toISOString() ?? null,
      services,
    };
  }

  private fallbackScoreDescription(score: number): string {
    if (score >= 90) return '전반적으로 안전한 상태예요.';
    if (score >= 70) return '일부 계정을 확인해 보세요.';
    if (score >= 50) return '몇 가지 조치가 필요해요.';
    return '즉각적인 조치가 필요한 계정이 있어요.';
  }
}
