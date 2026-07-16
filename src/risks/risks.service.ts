import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    body: { status: 'resolved' | 'skipped' | 'pending'; completedStepIds?: string[] },
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
        status: body.status === 'resolved' ? 'resolved' : sa.status,
        resolvedAt: body.status === 'resolved' ? new Date() : null,
      },
    });

    const allAccounts = await this.prisma.serviceAccount.findMany({
      where: { gmailAccount: { userId } },
    });
    const actionRequiredCount = allAccounts.filter(
      (a) => a.status === 'action_required' || a.status === 'watch',
    ).length;
    const highCount = allAccounts.filter((a) => a.riskLevel === 'high').length;
    const mediumCount = allAccounts.filter((a) => a.riskLevel === 'medium').length;
    const lowCount = allAccounts.filter((a) => a.riskLevel === 'low').length;
    const resolvedCount = allAccounts.filter((a) => a.status === 'resolved').length;
    const securityScore = Math.max(0, Math.min(100, 100 - highCount * 12 - mediumCount * 6 - lowCount * 2 + resolvedCount * 3));

    return {
      serviceAccountId: updated.id,
      status: body.status,
      resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      homeDelta: { actionRequiredCount, securityScore },
    };
  }

  async setDormant(serviceAccountId: string, userId: string) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, gmailAccount: { userId } },
    });
    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    await this.prisma.serviceAccount.update({
      where: { id: serviceAccountId },
      data: { status: 'dormant' },
    });

    return { serviceAccountId, status: 'dormant' };
  }
}
