import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AlimtalkService } from './alimtalk.service';
import type { RiskType } from '../analysis/ai-risk-mapping';

/**
 * 위험 종류 → 유저의 알림 수신 설정 필드.
 * 여기에 매핑되지 않은 위험 종류는 실시간 알림을 보내지 않는다.
 */
const RISK_TYPE_TO_SETTING: Partial<
  Record<RiskType, 'alertSuspiciousLogin' | 'alertPasswordChange' | 'alertNewDevice' | 'alertRecoveryEmail'>
> = {
  new_device_login: 'alertNewDevice',
  password_reset: 'alertPasswordChange',
  verification_code: 'alertSuspiciousLogin',
  account_recovery: 'alertRecoveryEmail',
  permission_grant: 'alertSuspiciousLogin',
};

const RISK_TYPE_LABEL: Partial<Record<RiskType, string>> = {
  new_device_login: '새 기기 로그인',
  password_reset: '비밀번호 변경',
  verification_code: '의심 로그인',
  account_recovery: '복구 이메일 변경',
  permission_grant: '외부 앱 권한 허용',
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alimtalk: AlimtalkService,
    private readonly config: ConfigService,
  ) {}

  private serviceUrl(path: string): string {
    const base = this.config.get<string>('FRONTEND_URL', 'https://idly.kr');
    return `${base.replace(/\/$/, '')}${path}`;
  }

  /**
   * 1) 분석 완료 알림 — 분석은 백그라운드로 계속 돌기 때문에, 앱을 나간 사용자에게
   *    결과가 준비됐음을 서비스 링크와 함께 알린다.
   */
  async sendAnalysisDone(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, nickname: true, phone: true, notificationAgreed: true },
    });

    if (!user?.phone) return;
    if (!user.notificationAgreed) return;

    await this.alimtalk.send({
      template: 'analysis_done',
      phone: user.phone,
      variables: {
        '#{name}': user.nickname ?? user.name ?? '고객',
        '#{url}': this.serviceUrl('/home'),
      },
    });
  }

  /**
   * 2) 실시간 보안 알림 — Gmail push로 새로 들어온 메일이 보안 위험으로 판정되면
   *    즉시 알린다. 위험 종류별 수신 설정을 각각 확인한다.
   */
  async sendSecurityAlert(params: {
    userId: string;
    serviceName: string;
    riskType: RiskType;
    serviceAccountId: string;
  }): Promise<void> {
    const { userId, serviceName, riskType, serviceAccountId } = params;

    const setting = RISK_TYPE_TO_SETTING[riskType];
    if (!setting) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        nickname: true,
        phone: true,
        notificationAgreed: true,
        alertSuspiciousLogin: true,
        alertPasswordChange: true,
        alertNewDevice: true,
        alertRecoveryEmail: true,
      },
    });

    if (!user?.phone) return;
    if (!user.notificationAgreed) return;
    if (!user[setting]) return;

    await this.alimtalk.send({
      template: 'security_alert',
      phone: user.phone,
      variables: {
        '#{name}': user.nickname ?? user.name ?? '고객',
        '#{service}': serviceName,
        '#{risk}': RISK_TYPE_LABEL[riskType] ?? '보안 위험',
        '#{url}': this.serviceUrl(`/account/${serviceAccountId}`),
      },
    });
  }

  /**
   * 3) 주간 리포트 알림 — 스케줄러가 호출한다.
   * @returns 발송 대상 수와 실제 발송 시도 수
   */
  async sendWeeklyReportReminders(): Promise<{ targets: number; sent: number }> {
    const users = await this.prisma.user.findMany({
      where: {
        phone: { not: null },
        notificationAgreed: true,
        onboardingCompleted: true,
      },
      select: { id: true, name: true, nickname: true, phone: true },
    });

    let sent = 0;
    for (const user of users) {
      if (!user.phone) continue;
      const result = await this.alimtalk.send({
        template: 'weekly_report',
        phone: user.phone,
        variables: {
          '#{name}': user.nickname ?? user.name ?? '고객',
          '#{url}': this.serviceUrl('/home'),
        },
      });
      if (result !== 'failed') sent += 1;
    }

    this.logger.log(`[weekly-report] 대상 ${users.length}명 중 ${sent}명 발송`);
    return { targets: users.length, sent };
  }
}
