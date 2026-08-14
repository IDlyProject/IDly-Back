import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisService } from './analysis.service';

const REANALYSIS_INTERVAL_DAYS = 7;
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 3_000;

@Injectable()
export class AnalysisSchedulerService {
  private readonly logger = new Logger(AnalysisSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisService: AnalysisService,
  ) {}

  /** 매일 새벽 3시 (KST) 실행 — 7일 이상 미분석 유저 순차 재분석 */
  @Cron('0 0 3 * * *', { timeZone: 'Asia/Seoul' })
  async runPeriodicReanalysis(): Promise<void> {
    this.logger.log('[periodic] 7-day reanalysis scan started');

    const cutoff = new Date(Date.now() - REANALYSIS_INTERVAL_DAYS * 24 * 60 * 60 * 1000);

    // 연결된 Gmail 계정이 있는 유저 중 마지막 완료 분석이 7일 초과이거나 한 번도 분석 안 된 유저
    const users = await this.prisma.user.findMany({
      where: {
        gmailAccounts: { some: { status: 'connected' } },
      },
      select: {
        id: true,
        analysisRuns: {
          where: { status: 'completed' },
          orderBy: { completedAt: 'desc' },
          take: 1,
          select: { completedAt: true },
        },
      },
    });

    const targets = users.filter((u) => {
      const lastAt = u.analysisRuns[0]?.completedAt;
      return !lastAt || lastAt < cutoff;
    });

    this.logger.log(`[periodic] ${targets.length} user(s) due for reanalysis`);

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(
        batch.map(async (u) => {
          try {
            const result = await this.analysisService.triggerScheduledAnalysis(u.id);
            this.logger.log(`[periodic][userId=${u.id}] ${result}`);
          } catch (e) {
            this.logger.error(`[periodic][userId=${u.id}] error: ${e instanceof Error ? e.message : e}`);
          }
        }),
      );

      if (i + BATCH_SIZE < targets.length) {
        await delay(BATCH_DELAY_MS);
      }
    }

    this.logger.log('[periodic] 7-day reanalysis scan completed');
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
