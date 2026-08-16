import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async send(dto: CreateFeedbackDto, userEmail: string | null): Promise<void> {
    const webhookUrl = this.config.get<string>('DISCORD_WEBHOOK_URL');

    if (!webhookUrl) {
      this.logger.warn(`[feedback] DISCORD_WEBHOOK_URL 미설정 — 로컬 로그만 출력`);
      this.logger.log(`[feedback] user=${userEmail ?? '익명'} screen=${dto.screenPath ?? '미제공'} msg=${dto.message}`);
      return;
    }

    const payload = {
      embeds: [
        {
          title: '🐛 버그 제보',
          color: 0xff4444,
          fields: [
            { name: '내용', value: dto.message },
            { name: '화면', value: dto.screenPath ?? '(미제공)', inline: true },
            { name: '유저', value: userEmail ?? '익명', inline: true },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      await firstValueFrom(this.http.post(webhookUrl, payload));
    } catch (e) {
      this.logger.error(`[feedback] Discord 전송 실패: ${e instanceof Error ? e.message : e}`);
    }
  }
}
