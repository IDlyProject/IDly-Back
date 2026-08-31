import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from './web-push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPush: WebPushService,
  ) {}

  /**
   * 사전등록 사용자의 기기를 구독으로 등록한다.
   *
   * 이 시점에는 아직 계정이 없어 인증할 수단이 없다. 그래서 이름과 전화번호가
   * 모두 일치하는 사전등록 건에만 연결하고, 저장은 endpoint 기준으로 upsert한다.
   * endpoint는 브라우저가 기기마다 발급하는 추측 불가능한 값이라, 남의 구독을
   * 덮어쓰려면 그 기기의 endpoint를 알아야 한다.
   */
  async subscribe(dto: SubscribePushDto): Promise<{ status: 'subscribed' }> {
    const entry = await this.prisma.waitlist.findUnique({
      where: { phone: dto.phone },
      select: { id: true, name: true },
    });

    if (!entry || entry.name !== dto.name) {
      // 어느 쪽이 틀렸는지 알려주면 전화번호 존재 여부를 캐낼 수 있으므로
      // 동일한 응답으로 처리한다.
      throw new NotFoundException('사전등록 정보를 찾을 수 없습니다.');
    }

    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        waitlistId: entry.id,
      },
      update: {
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        waitlistId: entry.id,
      },
    });

    return { status: 'subscribed' };
  }

  /** 구독 해제. 이미 없으면 조용히 넘어간다 — 해제는 멱등해야 한다. */
  async unsubscribe(endpoint: string): Promise<{ status: 'unsubscribed' }> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return { status: 'unsubscribed' };
  }

  /**
   * 사전등록 승인 알림.
   *
   * 알림 본문에 접근 토큰을 담지 않는다. 이 단계의 구독은 이름·전화번호만으로
   * 연결되므로, 토큰을 실으면 그 정보를 아는 사람이 접근 권한을 가로챌 수 있다.
   */
  async notifyWaitlistApproved(waitlistId: string): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { waitlistId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) return;

    await this.webPush.sendToSubscriptions(subscriptions, {
      title: 'IDly 접근 권한이 부여됐어요',
      body: '지금 바로 계정 보안 상태를 확인해보세요.',
      path: '/',
    });
  }

  /** 분석 완료 알림. 해당 유저의 모든 구독에 발송한다. */
  async notifyAnalysisComplete(userId: string): Promise<void> {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subscriptions.length === 0) return;

    await this.webPush.sendToSubscriptions(subscriptions, {
      title: '분석이 완료됐어요',
      body: '내 계정 보안 상태를 지금 바로 확인해보세요.',
      path: '/',
    });
  }

  /** 로그인 이후 같은 기기의 구독을 유저에 이어 붙인다 — 재구독을 요구하지 않기 위함. */
  async linkToUser(endpoint: string, userId: string): Promise<void> {
    const updated = await this.prisma.pushSubscription.updateMany({
      where: { endpoint },
      data: { userId },
    });
    if (updated.count === 0) {
      this.logger.debug(`[push] 연결할 구독 없음 — endpoint 미등록`);
    }
  }
}
