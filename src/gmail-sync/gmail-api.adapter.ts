import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, gmail_v1 } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import {
  decryptToken,
  isEncrypted,
  resolveEncryptionKey,
} from '../common/crypto/token-crypto';
import { withRetry } from '../common/http/with-retry';
import { assertGmailHistoryId } from './gmail-history-id';
import {
  GmailHistoryCursorExpiredError,
  GmailReconnectRequiredError,
} from './gmail-api.errors';

export type GmailWatchResult = {
  historyId: string;
  expiration: Date;
};

export type GmailHistoryDelta = {
  messageIds: string[];
  historyId: string;
};

@Injectable()
export class GmailApiAdapter {
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

  async watch(gmailAccountId: string): Promise<GmailWatchResult> {
    const topicName = this.config.get<string>('GMAIL_PUBSUB_TOPIC');
    if (!topicName) {
      throw new ServiceUnavailableException(
        'GMAIL_PUBSUB_TOPIC이 설정되지 않았습니다.',
      );
    }
    const gmail = await this.gmailForAccount(gmailAccountId);
    try {
      const response = await withRetry(() =>
        gmail.users.watch({
          userId: 'me',
          requestBody: { topicName },
        }),
      );
      const historyId = response.data.historyId;
      assertGmailHistoryId(historyId);
      const expirationMs = Number(response.data.expiration);
      if (!Number.isFinite(expirationMs) || expirationMs <= Date.now()) {
        throw new ServiceUnavailableException(
          'Gmail watch expiration 응답이 유효하지 않습니다.',
        );
      }
      return { historyId, expiration: new Date(expirationMs) };
    } catch (error) {
      return this.rethrowKnownError(gmailAccountId, error);
    }
  }

  async listHistory(
    gmailAccountId: string,
    startHistoryId: string,
  ): Promise<GmailHistoryDelta> {
    assertGmailHistoryId(startHistoryId);
    const gmail = await this.gmailForAccount(gmailAccountId);
    const messageIds = new Set<string>();
    let pageToken: string | undefined;
    let finalHistoryId = startHistoryId;

    try {
      do {
        const response = await withRetry(() =>
          gmail.users.history.list({
            userId: 'me',
            startHistoryId,
            historyTypes: ['messageAdded'],
            maxResults: 500,
            pageToken,
          }),
        );
        for (const history of response.data.history ?? []) {
          for (const added of history.messagesAdded ?? []) {
            if (added.message?.id) messageIds.add(added.message.id);
          }
        }
        if (response.data.historyId) {
          assertGmailHistoryId(response.data.historyId);
          finalHistoryId = response.data.historyId;
        }
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);

      return { messageIds: [...messageIds], historyId: finalHistoryId };
    } catch (error) {
      if (this.httpStatus(error) === 404) {
        throw new GmailHistoryCursorExpiredError(startHistoryId);
      }
      return this.rethrowKnownError(gmailAccountId, error);
    }
  }

  private async gmailForAccount(
    gmailAccountId: string,
  ): Promise<gmail_v1.Gmail> {
    const account = await this.prisma.gmailAccount.findUnique({
      where: { id: gmailAccountId },
      select: { refreshToken: true },
    });
    if (!account) throw new NotFoundException('Gmail 계정을 찾을 수 없습니다.');

    const refreshToken = isEncrypted(account.refreshToken)
      ? decryptToken(account.refreshToken, this.encryptionKey)
      : account.refreshToken;
    const auth = new google.auth.OAuth2(
      this.config.get('GOOGLE_CLIENT_ID'),
      this.config.get('GOOGLE_CLIENT_SECRET'),
      this.config.get('GOOGLE_REDIRECT_URI'),
    );
    auth.setCredentials({ refresh_token: refreshToken });
    return google.gmail({ version: 'v1', auth });
  }

  private async rethrowKnownError(
    gmailAccountId: string,
    error: unknown,
  ): Promise<never> {
    if (this.isAuthError(error)) {
      await this.prisma.gmailAccount.updateMany({
        where: { id: gmailAccountId },
        data: {
          status: 'reconnect_required',
          watchStatus: 'reconnect_required',
        },
      });
      throw new GmailReconnectRequiredError(gmailAccountId);
    }
    throw error;
  }

  private isAuthError(error: unknown) {
    const message = this.errorMessage(error);
    const status = this.httpStatus(error);
    return (
      status === 401 ||
      status === 403 ||
      /invalid_grant|invalid credentials|unauthorized|login required/i.test(
        message,
      )
    );
  }

  private httpStatus(error: unknown): number | string | undefined {
    const value = error as {
      code?: number | string;
      response?: { status?: number };
    };
    return value?.response?.status ?? value?.code;
  }

  private errorMessage(error: unknown): string {
    const value = error as {
      message?: string;
      response?: { data?: { error?: string } };
    };
    return String(value?.message ?? value?.response?.data?.error ?? '');
  }
}
