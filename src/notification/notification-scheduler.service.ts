import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly notification: NotificationService,
    private readonly config: ConfigService,
  ) {}

  /**
   * 주간 리포트 확인 알림 — 매주 월요일 오전 9시(KST).
   * WEEKLY_REPORT_ALIMTALK_ENABLED=false 로 끌 수 있다.
   */
  @Cron('0 0 9 * * 1', { timeZone: 'Asia/Seoul' })
  async sendWeeklyReport(): Promise<void> {
    if (this.config.get<string>('WEEKLY_REPORT_ALIMTALK_ENABLED') === 'false') {
      this.logger.log('[weekly-report] 비활성화됨 — 건너뜀');
      return;
    }

    try {
      const { targets, sent } = await this.notification.sendWeeklyReportReminders();
      this.logger.log(`[weekly-report] 완료 — 대상 ${targets}명, 발송 ${sent}명`);
    } catch (e) {
      this.logger.error(
        `[weekly-report] 실패: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
}
