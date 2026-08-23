import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { PushService } from './push.service';
import { WebPushService } from './web-push.service';

@ApiTags('웹 푸시')
@Controller('push')
@UseGuards(RateLimitGuard)
export class PushController {
  constructor(
    private readonly pushService: PushService,
    private readonly webPush: WebPushService,
  ) {}

  @Get('public-key')
  @ApiOperation({
    summary: 'VAPID 공개키 조회',
    description: `\`pushManager.subscribe()\`의 \`applicationServerKey\`로 사용합니다.

공개키를 코드에 하드코딩하면 키 교체 시 앱을 다시 배포해야 하므로 서버에서 받아갑니다.
\`key\`가 \`null\`이면 서버에 푸시가 설정되지 않은 상태이므로 구독을 시도하지 마세요.`,
  })
  @ApiResponse({ status: 200, schema: { example: { key: 'BIM4Nl...' } } })
  getPublicKey(): { key: string | null } {
    return { key: this.webPush.publicKey };
  }

  @Post('subscribe')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({
    summary: '푸시 구독 등록 — 사전등록 사용자',
    description: `**화면 1-1 사전등록 완료 이후**

브라우저에서 알림 권한을 허용하고 \`pushManager.subscribe()\`로 받은 구독 정보를 보냅니다.
아직 로그인 전이라 계정이 없으므로, 사전등록 시 입력한 **이름과 전화번호가 모두 일치**하는
건에만 연결됩니다.

저장은 \`endpoint\` 기준 upsert입니다. 같은 기기에서 다시 호출해도 중복 생성되지 않습니다.

승인 알림에는 접근 토큰이 담기지 않습니다. 알림을 받으면 앱을 열어 상태를 확인하는 흐름입니다.`,
  })
  @ApiResponse({ status: 200, schema: { example: { status: 'subscribed' } } })
  @ApiResponse({ status: 404, description: '이름·전화번호가 일치하는 사전등록 건 없음' })
  subscribe(@Body() dto: SubscribePushDto) {
    return this.pushService.subscribe(dto);
  }

  @Delete('subscribe')
  @HttpCode(200)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({
    summary: '푸시 구독 해제',
    description: '이미 해제된 구독이어도 200을 반환합니다 (멱등).',
  })
  @ApiResponse({ status: 200, schema: { example: { status: 'unsubscribed' } } })
  unsubscribe(@Body('endpoint') endpoint: string) {
    return this.pushService.unsubscribe(endpoint ?? '');
  }
}
