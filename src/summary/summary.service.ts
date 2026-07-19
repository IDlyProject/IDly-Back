import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { cleanServiceName } from '../common/registry/service-registry';

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
          where: { status: { notIn: ['dormant', 'skipped'] } },
          select: {
            id: true,
            serviceName: true,
            iconUrl: true,
            iconLabel: true,
            riskLevel: true,
            status: true,
            gmailAccountId: true,
            actionItems: {
              where: {
                NOT: { status: 'skipped' },
                OR: [
                  { status: 'pending' },
                  { updatedAt: { gte: monthStart } },
                ],
              },
              select: { id: true, title: true, status: true, updatedAt: true },
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    const mailAccounts = gmailAccounts.map((ga) => ({
      id: ga.id,
      email: ga.email,
      label: ga.label ?? 'Gmail동',
    }));

    const services = gmailAccounts
      .flatMap((ga) =>
        ga.serviceAccounts
          .filter((sa) => sa.actionItems.length > 0)
          .map((sa) => ({ ...sa, _ga: ga })),
      )
      .sort((a, b) => {
        const pendingA = a.actionItems.filter((i) => i.status === 'pending' || i.status === 'failed').length;
        const pendingB = b.actionItems.filter((i) => i.status === 'pending' || i.status === 'failed').length;
        return pendingB - pendingA;
      });

    const progress = { done: 0, pending: 0 };
    for (const sa of services) {
      for (const a of sa.actionItems) {
        if (a.status === 'done') progress.done++;
        else progress.pending++;
      }
    }

    return {
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      progress,
      mailAccounts,
      services: services.map((sa) => ({
        id: sa.id,
        serviceName: cleanServiceName(sa.serviceName),
        iconUrl: sa.iconUrl ?? null,
        iconLabel: sa.iconLabel ?? cleanServiceName(sa.serviceName)[0]?.toUpperCase() ?? '?',
        riskLevel: sa.riskLevel,
        status: sa.status,
        sourceMailAccount: {
          id: sa.gmailAccountId,
          email: sa._ga.email,
          label: sa._ga.label ?? 'Gmail동',
        },
        actions: sa.actionItems.map((a) => ({
          id: a.id,
          title: a.title,
          status: a.status,
          updatedAt: a.updatedAt.toISOString(),
        })),
      })),
    };
  }
}
