import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SolapiMessageService } from 'solapi';

/** 발송 종류별 템플릿 키 — 실제 템플릿 ID는 env로 주입한다. */
export type AlimtalkTemplate =
  | 'waitlist_approval'
  | 'analysis_done'
  | 'security_alert'
  | 'weekly_report';

const TEMPLATE_ENV_KEY: Record<AlimtalkTemplate, string> = {
  waitlist_approval: 'SOLAPI_TEMPLATE_ID',
  analysis_done: 'SOLAPI_TEMPLATE_ANALYSIS_DONE',
  security_alert: 'SOLAPI_TEMPLATE_SECURITY_ALERT',
  weekly_report: 'SOLAPI_TEMPLATE_WEEKLY_REPORT',
};

/**
 * 카카오 알림톡 발송 공용 서비스.
 *
 * 발송에 필요한 설정(API 키·발신번호·채널 pfId·템플릿 ID)이 하나라도 없으면
 * 예외를 던지지 않고 로그만 남기고 넘어간다. 알림 발송 실패가 분석 완료나
 * 메일 동기화 같은 본 흐름을 막아서는 안 되기 때문이다.
 */
@Injectable()
export class AlimtalkService {
  private readonly logger = new Logger(AlimtalkService.name);
  private client: SolapiMessageService | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): SolapiMessageService | null {
    if (this.client) return this.client;
    const apiKey = this.config.get<string>('SOLAPI_API_KEY');
    const apiSecret = this.config.get<string>('SOLAPI_API_SECRET');
    if (!apiKey || !apiSecret) return null;
    this.client = new SolapiMessageService(apiKey, apiSecret);
    return this.client;
  }

  /**
   * @returns 실제 발송됐으면 'sent', 설정 미비로 건너뛰었으면 'skipped',
   *          발송을 시도했지만 실패했으면 'failed'
   */
  async send(params: {
    template: AlimtalkTemplate;
    phone: string;
    variables: Record<string, string>;
  }): Promise<'sent' | 'skipped' | 'failed'> {
    const { template, phone, variables } = params;

    const client = this.getClient();
    const from = this.config.get<string>('SOLAPI_SENDER_NUMBER');
    const pfId = this.config.get<string>('SOLAPI_PF_ID');
    const templateId = this.config.get<string>(TEMPLATE_ENV_KEY[template]);

    if (!client || !from || !pfId || !templateId) {
      this.logger.warn(
        `[alimtalk] 설정 미비로 발송 생략 — template=${template} to=${this.mask(phone)} ` +
          `(client=${!!client} from=${!!from} pfId=${!!pfId} templateId=${!!templateId})`,
      );
      this.logger.log(
        `[alimtalk][MOCK] template=${template} to=${this.mask(phone)} vars=${JSON.stringify(variables)}`,
      );
      return 'skipped';
    }

    try {
      await client.send({
        to: phone.replace(/-/g, ''),
        from,
        kakaoOptions: { pfId, templateId, variables },
      });
      this.logger.log(
        `[alimtalk] 발송 완료 — template=${template} to=${this.mask(phone)}`,
      );
      return 'sent';
    } catch (e) {
      this.logger.error(
        `[alimtalk] 발송 실패 — template=${template} to=${this.mask(phone)}: ${
          e instanceof Error ? e.message : e
        }`,
      );
      return 'failed';
    }
  }

  /** 로그에 전화번호 원문이 남지 않도록 가운데를 가린다. */
  private mask(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return '***';
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }
}
