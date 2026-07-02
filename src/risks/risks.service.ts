import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RisksService {
  constructor(private readonly prisma: PrismaService) {}

  // 홈 화면(08): 이메일별 위험 서비스 목록
  async getRisksByEmail(userId: string, gmailAccountId?: string) {
    const where = gmailAccountId
      ? { gmailAccountId }
      : { gmailAccount: { userId } };

    return this.prisma.serviceAccount.findMany({
      where: {
        ...where,
        riskStatus: { in: ['warning', 'danger'] },
      },
      include: {
        riskEvents: {
          where: { status: 'pending' },
          include: { actionItems: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        gmailAccount: { select: { email: true } },
      },
      orderBy: { lastAnalyzedAt: 'desc' },
    });
  }

  // 화면 09: 서비스 상세 (신호 + 대응 방법)
  async getServiceDetail(serviceAccountId: string, userId: string) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: {
        id: serviceAccountId,
        gmailAccount: { userId },
      },
      include: {
        gmailAccount: { select: { email: true } },
        riskEvents: {
          where: { status: 'pending' },
          include: { actionItems: true },
          orderBy: { severity: 'desc' },
        },
      },
    });

    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');
    return sa;
  }

  // 화면 10: 조치 목록
  async getActionItems(serviceAccountId: string, userId: string) {
    const sa = await this.prisma.serviceAccount.findFirst({
      where: { id: serviceAccountId, gmailAccount: { userId } },
    });
    if (!sa) throw new NotFoundException('서비스를 찾을 수 없습니다.');

    return this.prisma.actionItem.findMany({
      where: {
        riskEvent: { serviceAccountId },
      },
      include: {
        riskEvent: { select: { riskType: true, severity: true } },
      },
      orderBy: [{ riskEvent: { severity: 'desc' } }, { isRequired: 'desc' }],
    });
  }

  // 화면 10-3: 개별 조치 완료 처리
  async markActionDone(actionItemId: string, userId: string) {
    await this.verifyActionOwnership(actionItemId, userId);
    return this.prisma.actionItem.update({
      where: { id: actionItemId },
      data: { status: 'done' },
    });
  }

  // 화면 10: 조치 건너뛰기
  async skipAction(actionItemId: string, userId: string) {
    await this.verifyActionOwnership(actionItemId, userId);
    return this.prisma.actionItem.update({
      where: { id: actionItemId },
      data: { status: 'skipped' },
    });
  }

  // 전체 완료 후 riskEvent 상태 업데이트
  async resolveRiskEvent(riskEventId: string, userId: string) {
    const re = await this.prisma.riskEvent.findFirst({
      where: {
        id: riskEventId,
        serviceAccount: { gmailAccount: { userId } },
      },
    });
    if (!re) throw new NotFoundException('리스크 이벤트를 찾을 수 없습니다.');

    return this.prisma.riskEvent.update({
      where: { id: riskEventId },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
  }

  private async verifyActionOwnership(actionItemId: string, userId: string) {
    const item = await this.prisma.actionItem.findFirst({
      where: {
        id: actionItemId,
        riskEvent: { serviceAccount: { gmailAccount: { userId } } },
      },
    });
    if (!item) throw new NotFoundException('조치 항목을 찾을 수 없습니다.');
    return item;
  }
}
