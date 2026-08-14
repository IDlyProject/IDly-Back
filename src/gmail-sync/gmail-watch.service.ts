import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GmailApiAdapter, GmailWatchResult } from './gmail-api.adapter';
import { GmailReconnectRequiredError } from './gmail-api.errors';

@Injectable()
export class GmailWatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailApi: GmailApiAdapter,
  ) {}

  bootstrap(gmailAccountId: string): Promise<GmailWatchResult> {
    return this.register(gmailAccountId);
  }

  renew(gmailAccountId: string): Promise<GmailWatchResult> {
    return this.register(gmailAccountId);
  }

  private async register(gmailAccountId: string): Promise<GmailWatchResult> {
    const claimed = await this.prisma.gmailAccount.updateMany({
      where: { id: gmailAccountId, status: 'connected' },
      data: { watchStatus: 'pending' },
    });
    if (claimed.count !== 1) {
      throw new NotFoundException('연결된 Gmail 계정을 찾을 수 없습니다.');
    }
    try {
      const result = await this.gmailApi.watch(gmailAccountId);
      await this.prisma.gmailAccount.update({
        where: { id: gmailAccountId },
        data: {
          watchStatus: 'active',
          watchHistoryId: result.historyId,
          watchExpiration: result.expiration,
          watchLastRenewedAt: new Date(),
        },
      });
      return result;
    } catch (error) {
      if (!(error instanceof GmailReconnectRequiredError)) {
        await this.prisma.gmailAccount.updateMany({
          where: { id: gmailAccountId, status: 'connected' },
          data: { watchStatus: 'renew_error' },
        });
      }
      throw error;
    }
  }
}
