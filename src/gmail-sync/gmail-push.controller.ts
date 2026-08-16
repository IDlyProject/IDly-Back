import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { GmailPushEnvelopeDto } from './dto/gmail-push.dto';
import { GmailPushInboxService } from './gmail-push-inbox.service';
import { GmailPushOidcGuard } from './gmail-push-oidc.guard';

@ApiExcludeController()
@Controller('gmail/push')
export class GmailPushController {
  constructor(private readonly inbox: GmailPushInboxService) {}

  /**
   * Pub/Sub delivery endpoint. OIDC 검증과 durable inbox 저장만 수행하며,
   * Gmail 조회나 AI 분석은 절대 이 요청에서 실행하지 않는다.
   */
  @Post()
  @UseGuards(GmailPushOidcGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async receive(@Body() envelope: GmailPushEnvelopeDto): Promise<void> {
    await this.inbox.record(envelope);
  }
}
