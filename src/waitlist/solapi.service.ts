import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SolapiService {
  private readonly logger = new Logger(SolapiService.name);

  constructor(private readonly config: ConfigService) {}

  async sendApprovalAlimtalk(params: {
    name: string;
    phone: string;
    token: string;
  }): Promise<void> {
    const apiKey = this.config.get<string>('SOLAPI_API_KEY');
    const apiSecret = this.config.get<string>('SOLAPI_API_SECRET');
    const pfId = this.config.get<string>('SOLAPI_PF_ID'); // 카카오 채널 pfId
    const templateId = this.config.get<string>('SOLAPI_TEMPLATE_ID');

    if (!apiKey || !apiSecret) {
      this.logger.warn('SOLAPI_API_KEY / SOLAPI_API_SECRET not configured — skipping alimtalk');
      return;
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://idly.app');
    const approvalUrl = `${frontendUrl}/login?token=${params.token}`;

    // TODO: solapi npm 패키지 설치 후 아래 주석 해제
    // const solapi = new SolapiMessageService(apiKey, apiSecret);
    // await solapi.sendOne({
    //   to: params.phone,
    //   from: this.config.get<string>('SOLAPI_SENDER_NUMBER')!,
    //   kakaoOptions: {
    //     pfId,
    //     templateId,
    //     variables: {
    //       '#{name}': params.name,
    //       '#{url}': approvalUrl,
    //     },
    //   },
    // });

    this.logger.log(
      `[MOCK] 알림톡 발송: ${params.phone} / ${params.name} / ${approvalUrl}`,
    );
  }
}
