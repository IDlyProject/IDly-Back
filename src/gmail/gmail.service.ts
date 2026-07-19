import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { createWriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptToken,
  encryptToken,
  isEncrypted,
  resolveEncryptionKey,
} from '../common/crypto/token-crypto';

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.encryptionKey = resolveEncryptionKey(
      config.get('REFRESH_TOKEN_SECRET'),
      config.get('NODE_ENV'),
    );
  }

  private getOAuth2Client(refreshToken: string) {
    const client = new google.auth.OAuth2(
      this.config.get('GOOGLE_CLIENT_ID'),
      this.config.get('GOOGLE_CLIENT_SECRET'),
      this.config.get('GOOGLE_REDIRECT_URI'),
    );
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  private isAuthError(error: unknown): boolean {
    const err = error as {
      code?: number | string;
      response?: { status?: number; data?: { error?: string } };
      message?: string;
    };
    const status = err?.response?.status ?? err?.code;
    const msg = String(err?.message ?? err?.response?.data?.error ?? '');
    return (
      status === 401 ||
      status === 403 ||
      /invalid_grant|invalid credentials|unauthorized|login required/i.test(msg)
    );
  }

  private async markReconnectRequired(gmailAccountId: string) {
    await this.prisma.gmailAccount.update({
      where: { id: gmailAccountId },
      data: { status: 'reconnect_required' },
    });
    this.logger.warn(
      `Gmail account ${gmailAccountId} marked reconnect_required`,
    );
  }

  /**
   * Gmail 전체 메일을 .mbox 형식으로 임시 파일에 스트리밍 저장 후 경로 반환
   * RFC 4155 준수: From <sender> <date>\n<raw message>\n\n
   * 호출 측에서 tmpPath 파일을 반드시 삭제해야 함
   */
  async fetchAllEmailsAsMbox(
    gmailAccountId: string,
    userId: string,
  ): Promise<{
    tmpPath: string;
    count: number;
    sizeBytes: number;
    lastEmailDate: Date | null;
  }> {
    const account = await this.prisma.gmailAccount.findFirst({
      where: { id: gmailAccountId, userId },
    });
    if (!account) throw new NotFoundException('Gmail 계정을 찾을 수 없습니다.');

    // Decrypt refresh token; lazily migrate plaintext tokens
    let plainRefreshToken: string;
    if (isEncrypted(account.refreshToken)) {
      plainRefreshToken = decryptToken(
        account.refreshToken,
        this.encryptionKey,
      );
    } else {
      plainRefreshToken = account.refreshToken;
      this.prisma.gmailAccount
        .update({
          where: { id: gmailAccountId },
          data: {
            refreshToken: encryptToken(
              account.refreshToken,
              this.encryptionKey,
            ),
          },
        })
        .catch((e) =>
          this.logger.warn(
            `refresh token migration failed for ${gmailAccountId}: ${e.message}`,
          ),
        );
    }

    const auth = this.getOAuth2Client(plainRefreshToken);
    const gmail = google.gmail({ version: 'v1', auth });

    const tmpPath = join(tmpdir(), `mbox-${gmailAccountId}-${Date.now()}.mbox`);
    const writer = createWriteStream(tmpPath, { encoding: 'binary' });

    try {
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

      let count = 0;
      let sizeBytes = 0;
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

          const rawBytes = Buffer.from(msg.raw, 'base64url').toString('binary');
          const emailDate = msg.internalDate
            ? new Date(parseInt(msg.internalDate))
            : new Date();
          if (!lastEmailDate || emailDate > lastEmailDate)
            lastEmailDate = emailDate;

          const chunk = `From mboxrd@localhost ${emailDate.toUTCString()}\n${rawBytes}\n\n`;
          const ok = writer.write(chunk, 'binary');
          if (!ok) await new Promise<void>((r) => writer.once('drain', r));
          sizeBytes += Buffer.byteLength(chunk, 'binary');
          count += 1;
        }

        if (i % 100 === 0) {
          this.logger.log(`  → ${i}/${messageIds.length} 처리 중...`);
        }
      }

      await new Promise<void>((resolve, reject) => {
        writer.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });

      await this.prisma.gmailAccount.update({
        where: { id: gmailAccountId },
        data: { lastSyncedAt: new Date(), status: 'connected' },
      });

      return { tmpPath, count, sizeBytes, lastEmailDate };
    } catch (error) {
      writer.destroy();
      if (this.isAuthError(error)) {
        await this.markReconnectRequired(gmailAccountId);
        throw new UnauthorizedException(
          'Gmail 권한이 만료되었거나 취소되었습니다. 계정을 다시 연결해 주세요.',
        );
      }
      throw error;
    }
  }
}
