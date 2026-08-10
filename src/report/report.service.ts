import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeSecurityScore } from '../common/domain/metrics';
import { ReportSnapshot } from '../common/solar/solar.service';
import { cleanServiceName } from '../common/registry/service-registry';

const RISK_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2, safe: 3 };

function gradeLabel(score: number): '위험' | '주의' | '양호' {
  if (score >= 80) return '양호';
  if (score >= 60) return '주의';
  return '위험';
}

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
          where: { status: { notIn: ['dormant', 'skipped'] } },
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

    const securityScore = computeSecurityScore(allAccounts);
    const raw = latestRun?.reportSnapshot ?? null;
    const snapshot = raw && (raw as any).status !== 'invalidated' ? (raw as unknown as ReportSnapshot) : null;

    const riskCounts = {
      high: allAccounts.filter((a) => a.riskLevel === 'high').length,
      medium: allAccounts.filter((a) => a.riskLevel === 'medium').length,
      low: allAccounts.filter((a) => a.riskLevel === 'low').length,
      safe: allAccounts.filter((a) => a.riskLevel === 'safe').length,
    };
    // UI 3카드(위험/주의/안전)용 집계 — low는 주의에 합산
    const summaryCounts = {
      danger: riskCounts.high,
      caution: riskCounts.medium + riskCounts.low,
      safe: riskCounts.safe,
    };

    const services = allAccounts
      .filter((sa) => sa.riskLevel !== 'safe')
      .sort((a, b) => (RISK_ORDER[a.riskLevel] ?? 3) - (RISK_ORDER[b.riskLevel] ?? 3))
      .map((sa) => {
        const snapshotRec = snapshot?.recommendations?.find((r) => r.serviceAccountId === sa.id);
        return {
          id: sa.id,
          serviceName: cleanServiceName(sa.serviceName),
          iconUrl: sa.iconUrl ?? null,
          iconLabel: sa.iconLabel ?? cleanServiceName(sa.serviceName)[0]?.toUpperCase() ?? '?',
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

    const SECURITY_RISK_TYPES = new Set([
      'password_reset', 'new_device_login', 'suspicious_login',
      'account_recovery', 'unauthorized_access', 'data_breach',
      'phishing', 'malware', 'account_takeover',
    ]);
    const seenRiskEventKeys = new Set<string>();
    const riskEvents = allAccounts
      .flatMap((sa) =>
        sa.riskEvidences
          .filter((e) => SECURITY_RISK_TYPES.has(e.riskType))
          .map((e) => {
            const snapshotEv = snapshot?.riskEvents?.find((ev) => ev.evidenceId === e.id);
            return {
              id: e.id,
              serviceName: cleanServiceName(sa.serviceName),
              title: snapshotEv?.title ?? e.subject ?? null,
              description: snapshotEv?.description ?? e.summary ?? null,
              riskType: e.riskType,
              receivedAt: e.receivedAt?.toISOString() ?? null,
            };
          }),
      )
      .sort((a, b) => {
        if (!a.receivedAt && !b.receivedAt) return 0;
        if (!a.receivedAt) return 1;
        if (!b.receivedAt) return -1;
        return b.receivedAt.localeCompare(a.receivedAt);
      })
      .filter((e) => {
        const key = `${e.serviceName}::${e.title}`;
        if (seenRiskEventKeys.has(key)) return false;
        seenRiskEventKeys.add(key);
        return true;
      })
      .slice(0, 10);

    return {
      securityScore,
      grade: gradeLabel(securityScore),
      scoreDescription: snapshot?.scoreDescription ?? this.fallbackScoreDescription(securityScore),
      hasAiSnapshot: !!snapshot,
      riskCounts,
      summaryCounts,
      analyzedAt: latestRun?.completedAt?.toISOString() ?? null,
      riskEvents,
      services,
    };
  }

  private fallbackScoreDescription(score: number): string {
    if (score >= 80) return '전반적으로 안전한 상태예요.';
    if (score >= 60) return '일부 계정을 확인해 보세요.';
    if (score >= 40) return '몇 가지 조치가 필요해요.';
    return '즉각적인 조치가 필요한 계정이 있어요.';
  }
}
