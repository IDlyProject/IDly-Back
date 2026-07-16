import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CARD_NEWS = [
  { id: 'cn_001', emoji: '🏠', title: '불 꺼진 창문, 그냥 두면 위험한 이유', url: 'https://idly.kr/news/1' },
  { id: 'cn_002', emoji: '🔑', title: '비밀번호 하나로 다 쓰면 생기는 일', url: 'https://idly.kr/news/2' },
  { id: 'cn_003', emoji: '📱', title: '2단계 인증, 이렇게 하면 더 안전해요', url: 'https://idly.kr/news/3' },
];

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(userId: string, mailAccountId: string = 'all') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const gmailAccounts = await this.prisma.gmailAccount.findMany({
      where: {
        userId,
        ...(mailAccountId !== 'all' ? { id: mailAccountId } : {}),
      },
      include: { serviceAccounts: true },
    });

    const latestRun = await this.prisma.analysisRun.findFirst({
      where: { userId },
      orderBy: { startedAt: 'desc' },
    });

    const backgroundAnalysis =
      latestRun?.status === 'queued' || latestRun?.status === 'scanning'
        ? { status: 'scanning' as const, analysisId: latestRun.id }
        : latestRun?.status === 'failed'
        ? { status: 'failed' as const, analysisId: latestRun.id }
        : { status: 'idle' as const, analysisId: null };

    const lastRun = await this.prisma.analysisRun.findFirst({
      where: { userId, status: 'completed' },
      orderBy: { completedAt: 'desc' },
    });

    const allServiceAccounts = gmailAccounts.flatMap((ga) => ga.serviceAccounts).filter((sa) => sa.status !== 'dormant');

    const actionRequiredCount = allServiceAccounts.filter(
      (sa) => sa.status === 'action_required' || sa.status === 'watch',
    ).length;

    const highCount = allServiceAccounts.filter((sa) => sa.riskLevel === 'high').length;
    const mediumCount = allServiceAccounts.filter((sa) => sa.riskLevel === 'medium').length;
    const lowCount = allServiceAccounts.filter((sa) => sa.riskLevel === 'low').length;
    const resolvedCount = allServiceAccounts.filter((sa) => sa.status === 'resolved').length;

    const securityScore = Math.max(
      0,
      Math.min(100, 100 - highCount * 12 - mediumCount * 6 - lowCount * 2 + resolvedCount * 3),
    );

    const topRisk = allServiceAccounts
      .filter((sa) => sa.status === 'action_required')
      .sort((a, b) => this.riskWeight(b.riskLevel) - this.riskWeight(a.riskLevel))[0];

    const riskSummary = topRisk
      ? {
          state: 'has_risk' as const,
          title: `가장 먼저 ${topRisk.displayName ?? topRisk.serviceName} 확인`,
          subtitle: `${this.riskTypeLabel(topRisk.primaryRiskType)} · ${this.riskLevelLabel(topRisk.riskLevel)}`,
          serviceAccountId: topRisk.id,
        }
      : {
          state: 'safe' as const,
          title: '모든 계정이 양호합니다',
          subtitle: `통합 보안 점수 ${securityScore}점`,
          serviceAccountId: null,
        };

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
        serviceAccountCount: ga.serviceAccounts.length,
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
        serviceName: sa.serviceName,
        displayName: sa.displayName ?? sa.serviceName,
        iconUrl: sa.iconUrl,
        iconLabel: sa.iconLabel ?? sa.serviceName.charAt(0).toUpperCase(),
        riskLevel: sa.riskLevel,
        status: sa.status,
        primaryRiskType: sa.primaryRiskType,
      })),
      cardNews: CARD_NEWS,
    };
  }

  private riskWeight(level: string): number {
    return { high: 3, medium: 2, low: 1, safe: 0 }[level] ?? 0;
  }

  private riskTypeLabel(riskType: string | null): string {
    const map: Record<string, string> = {
      new_device_login: '새 기기 로그인',
      password_reset: '비밀번호 재설정',
      verification_code: '인증 코드',
      account_recovery: '계정 복구',
      permission_grant: '권한 허용',
      security_recommendation: '보안 알림',
    };
    return map[riskType ?? ''] ?? '보안 알림';
  }

  private riskLevelLabel(level: string): string {
    return { high: '위험도 높음', medium: '위험도 중간', low: '주의', safe: '안전' }[level] ?? '';
  }
}
