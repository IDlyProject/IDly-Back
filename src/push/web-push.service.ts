import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export type PushPayload = {
  title: string;
  body: string;
  /** 알림을 눌렀을 때 열 경로. 앱 내부 경로만 허용한다. */
  path: string;
};

/**
 * 웹 푸시 발송.
 *
 * VAPID 키가 없으면 예외를 던지지 않고 로그만 남긴다. 알림 발송 실패가
 * 승인 처리 같은 본 흐름을 되돌려서는 안 되기 때문이다.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private configured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');

    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    } else {
      this.logger.warn('[push] VAPID 미설정 — 발송은 로그만 남기고 건너뜁니다.');
    }
  }

  get publicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  /**
   * 대상 구독들에게 발송한다.
   *
   * 만료·해지된 구독(404/410)은 다시 살아나지 않으므로 즉시 정리한다.
   * 그대로 두면 발송할 때마다 실패가 쌓인다.
   *
   * @returns 발송 성공 수와 정리한 구독 수
   */
  async sendToSubscriptions(
    subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[],
    payload: PushPayload,
  ): Promise<{ sent: number; removed: number }> {
    if (!this.configured) {
      this.logger.log(
        `[push][MOCK] ${subscriptions.length}건 대상 — ${payload.title} / ${payload.body}`,
      );
      return { sent: 0, removed: 0 };
    }

    let sent = 0;
    const expired: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          expired.push(sub.id);
        } else {
          this.logger.error(
            `[push] 발송 실패 (status=${status ?? 'unknown'}): ${
              e instanceof Error ? e.message : e
            }`,
          );
        }
      }
    }

    if (expired.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: expired } },
      });
    }

    if (sent > 0) {
      await this.prisma.pushSubscription.updateMany({
        where: { id: { in: subscriptions.map((s) => s.id) } },
        data: { lastSentAt: new Date() },
      });
    }

    this.logger.log(
      `[push] 발송 ${sent}/${subscriptions.length}건, 만료 구독 ${expired.length}건 정리`,
    );
    return { sent, removed: expired.length };
  }
}
