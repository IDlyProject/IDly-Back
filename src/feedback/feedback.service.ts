import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data') as typeof import('form-data');
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async send(
    dto: CreateFeedbackDto,
    userEmail: string | null,
    images?: Express.Multer.File[],
  ): Promise<void> {
    const webhookUrl = this.config.get<string>('DISCORD_WEBHOOK_URL');
    const hasImages = images && images.length > 0;

    if (!webhookUrl) {
      this.logger.warn(`[feedback] DISCORD_WEBHOOK_URL 미설정 — 로컬 로그만 출력`);
      this.logger.log(
        `[feedback] user=${userEmail ?? '익명'} screen=${dto.screenPath ?? '미제공'} msg=${dto.message} images=${hasImages ? images.length : 0}`,
      );
      return;
    }

    const embedPayload = {
      embeds: [
        {
          title: '🐛 버그 / 불편사항 제보',
          color: 0xff4444,
          fields: [
            { name: '내용', value: dto.message },
            { name: '화면', value: dto.screenPath ?? '(미제공)', inline: true },
            { name: '유저', value: userEmail ?? '익명', inline: true },
          ],
          ...(hasImages ? { image: { url: 'attachment://feedback_0.png' } } : {}),
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      if (hasImages) {
        const form = new FormData();
        form.append('payload_json', JSON.stringify(embedPayload));
        images.forEach((img, idx) => {
          form.append(`files[${idx}]`, img.buffer, {
            filename: `feedback_${idx}.png`,
            contentType: img.mimetype,
          });
        });
        await firstValueFrom(
          this.http.post(webhookUrl, form, { headers: form.getHeaders() }),
        );
      } else {
        await firstValueFrom(this.http.post(webhookUrl, embedPayload));
      }
    } catch (e) {
      this.logger.error(`[feedback] Discord 전송 실패: ${e instanceof Error ? e.message : e}`);
    }
  }
}
