import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeSecurityScore, isActiveForHomeMetrics } from '../common/domain/metrics';

const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, safe: 3 };

@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const gmailAccounts = await this.prisma.gmailAccount.findMany({
      where: { userId },
      include: {
        serviceAccounts: {
          include: {
            riskEvidences: {
              where: { receivedAt: { gte: monthStart } },
              orderBy: { receivedAt: 'desc' },
            },
            actionItems: { where: { status: 'pending', isRequired: true }, select: { id: true } },
          },
        },
      },
    });

    const allAccounts = gmailAccounts.flatMap((ga) =>
      ga.serviceAccounts.map((sa) => ({ ...sa, gmailEmail: ga.email, gmailLabel: ga.label })),
    );

    const activeAccounts = allAccounts.filter((sa) =>
      isActiveForHomeMetrics(sa.status),
    );

    const securityScore = computeSecurityScore(activeAccounts);

    const accounts = activeAccounts
      .filter((sa) => sa.riskLevel !== 'safe' || sa.riskEvidences.length > 0)
      .sort((a, b) => (RISK_ORDER[a.riskLevel] ?? 99) - (RISK_ORDER[b.riskLevel] ?? 99));

    return {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      securityScore,
      totalServices: activeAccounts.length,
      riskyServices: activeAccounts.filter((a) => a.riskLevel !== 'safe').length,
      accounts: accounts.map((sa) => ({
        id: sa.id,
        serviceName: sa.serviceName,
        iconUrl: sa.iconUrl ?? null,
        iconLabel: sa.iconLabel ?? sa.serviceName[0]?.toUpperCase() ?? '?',
        riskLevel: sa.riskLevel,
        status: sa.status,
        primaryRiskType: sa.primaryRiskType ?? null,
        headline: sa.headline ?? null,
        hasRequiredAction: sa.actionItems.length > 0,
        evidenceCount: sa.riskEvidences.length,
        recentEvidences: sa.riskEvidences.slice(0, 2).map((e) => ({
          id: e.id,
          subject: e.subject ?? null,
          receivedAt: e.receivedAt?.toISOString() ?? null,
          riskType: e.riskType,
        })),
        sourceMailAccount: { email: sa.gmailEmail, label: sa.gmailLabel ?? 'Gmail동' },
      })),
    };
  }
}
