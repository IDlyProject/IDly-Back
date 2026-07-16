import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private getOAuth2Client(refreshToken: string) {
    const client = new google.auth.OAuth2(
      this.config.get('GOOGLE_CLIENT_ID'),
      this.config.get('GOOGLE_CLIENT_SECRET'),
      this.config.get('GOOGLE_REDIRECT_URI'),
    );
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  /**
   * Gmail 전체 메일을 .mbox 형식 Buffer로 반환
   * RFC 4155 준수: From <sender> <date>\n<raw message>\n\n
   */
  async fetchAllEmailsAsMbox(
    gmailAccountId: string,
    userId: string,
  ): Promise<{
    mbox: Buffer;
    count: number;
    sizeBytes: number;
    lastEmailDate: Date | null;
  }> {
    const account = await this.prisma.gmailAccount.findFirst({
      where: { id: gmailAccountId, userId },
    });
    if (!account) throw new NotFoundException('Gmail 계정을 찾을 수 없습니다.');

    const auth = this.getOAuth2Client(account.refreshToken);
    const gmail = google.gmail({ version: 'v1', auth });

    // 전체 메일 ID 목록 수집 (페이지네이션)
    const messageIds: string[] = [];
    let pageToken: string | undefined;

    do {
      const res = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 500,
        pageToken,
      });
      for (const m of res.data.messages ?? []) {
        if (m.id) messageIds.push(m.id);
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    this.logger.log(`[${account.email}] 전체 메일 수: ${messageIds.length}`);

    // 배치로 raw 포맷 fetch (동시 10개씩)
    const mboxParts: string[] = [];
    let lastEmailDate: Date | null = null;
    const BATCH = 10;

    for (let i = 0; i < messageIds.length; i += BATCH) {
      const batch = messageIds.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((id) =>
          gmail.users.messages.get({ userId: 'me', id, format: 'raw' }),
        ),
      );

      for (const result of results) {
        if (result.status === 'rejected') continue;
        const msg = (result.value as any).data;
        if (!msg?.raw) continue;

        // base64url → Buffer → raw RFC 2822 메시지
        const rawBytes = Buffer.from(msg.raw, 'base64url').toString('binary');

        // mbox From_ 라인 생성 (internalDate는 ms 단위)
        const emailDate = msg.internalDate ? new Date(parseInt(msg.internalDate)) : new Date();
        if (!lastEmailDate || emailDate > lastEmailDate) lastEmailDate = emailDate;

        mboxParts.push(`From mboxrd@localhost ${emailDate.toUTCString()}\n${rawBytes}\n\n`);
      }

      if (i % 100 === 0) {
        this.logger.log(`  → ${i}/${messageIds.length} 처리 중...`);
      }
    }

    await this.prisma.gmailAccount.update({
      where: { id: gmailAccountId },
      data: { lastSyncedAt: new Date() },
    });

    const mbox = Buffer.from(mboxParts.join(''), 'binary');
    return { mbox, count: mboxParts.length, sizeBytes: mbox.byteLength, lastEmailDate };
  }
}
