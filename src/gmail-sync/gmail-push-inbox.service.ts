import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { GmailPushData, GmailPushEnvelopeDto } from './dto/gmail-push.dto';
import { assertGmailHistoryId } from './gmail-history-id';

export type RecordPushResult =
  | { status: 'stored'; eventId: string }
  | { status: 'duplicate' }
  | { status: 'ignored_unknown_account' };

@Injectable()
export class GmailPushInboxService {
  constructor(private readonly prisma: PrismaService) {}

  async record(envelope: GmailPushEnvelopeDto): Promise<RecordPushResult> {
    const data = this.decodeData(envelope.message.data);
    const account = await this.prisma.gmailAccount.findFirst({
      where: { email: data.emailAddress, status: 'connected' },
      select: { id: true },
    });

    // 알 수 없거나 이미 삭제된 계정은 재시도해도 복구되지 않으므로 ACK 대상이다.
    if (!account) return { status: 'ignored_unknown_account' };

    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const stored = await tx.gmailPushEvent.create({
          data: {
            pubsubMessageId: envelope.message.messageId,
            gmailAccountId: account.id,
            notifiedHistoryId: data.historyId,
            publishedAt: envelope.message.publishTime
              ? new Date(envelope.message.publishTime)
              : null,
          },
          select: { id: true },
        });
        await tx.gmailAccount.update({
          where: { id: account.id },
          data: { lastPushAt: new Date() },
        });
        return stored;
      });
      return { status: 'stored', eventId: event.id };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { status: 'duplicate' };
      }
      throw error;
    }
  }

  private decodeData(encoded: string): GmailPushData {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    } catch {
      throw new BadRequestException('Gmail Push payload를 해석할 수 없습니다.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new BadRequestException('유효하지 않은 Gmail Push payload입니다.');
    }
    const data = parsed as Record<string, unknown>;
    if (
      typeof data.emailAddress !== 'string' ||
      data.emailAddress.length === 0 ||
      data.emailAddress.length > 320
    ) {
      throw new BadRequestException('유효하지 않은 Gmail 계정입니다.');
    }
    assertGmailHistoryId(data.historyId);
    return {
      emailAddress: data.emailAddress,
      historyId: data.historyId,
    };
  }
}
