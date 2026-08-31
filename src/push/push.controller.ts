import { Body, Controller, Delete, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { JwtGuard, AuthUser } from '../auth/jwt.guard';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { PushService } from './push.service';
import { WebPushService } from './web-push.service';
import type { Request } from 'express';

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
\`key\`가 \`null\`이면 서버에 푸시가 설정되지 않은 상태이므로 구독을 시도하지 마세요.

---

## 프론트 연동 전체 흐름

\`\`\`js
// 1) 권한 요청 — 반드시 사용자 클릭 안에서 호출해야 합니다.
//    거부당하면 브라우저가 기억해서 다시 물어볼 수 없습니다.
const permission = await Notification.requestPermission();
if (permission !== 'granted') return;

// 2) 공개키 조회
const { key } = await axiosInstance.get('/api/push/public-key').then(r => r.data);
if (!key) return; // 서버에 푸시 미설정

// 3) 구독 생성
const reg = await navigator.serviceWorker.ready;
const sub = await reg.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: key,   // base64url 문자열 그대로 넣으면 됩니다
});

// 4) 서버에 등록
const { endpoint, keys } = sub.toJSON();
await axiosInstance.post('/api/push/subscribe', {
  name,   // 사전등록 시 입력한 이름
  phone,  // 사전등록 시 입력한 전화번호 (localStorage의 waitlist_phone)
  endpoint,
  keys,   // { p256dh, auth }
});
\`\`\`

## 서비스워커에 핸들러가 필요합니다

발송 페이로드는 \`{ title, body, path }\` 형태의 JSON 문자열입니다.

\`\`\`js
self.addEventListener('push', (event) => {
  const { title, body, path } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, { body, data: { path }, icon: '/icons/icon-192.png' })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.path));
});
\`\`\`

## 플랫폼 제약

- **iOS** — 홈 화면에 추가해 \`display-mode: standalone\`으로 실행한 상태에서만 권한 요청이 됩니다. 사파리 탭에서 호출하면 아무 일도 일어나지 않습니다. iOS 16.4 이상만 지원합니다.
- **Android** — 설치 여부와 무관하게 동작합니다. 다만 설치하면 알림이 크롬이 아니라 IDly 이름으로 뜹니다.
- **인앱 브라우저**(카카오톡·인스타) — 양 플랫폼 모두 설치·구독이 불가능합니다. 폴백 안내가 필요합니다.`,
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

## 승인 이후 사용자는 어떻게 진입하나

승인 알림에는 **접근 토큰이 담기지 않습니다.** 이 단계의 구독은 이름·전화번호만으로 연결되므로, 토큰을 실으면 그 정보를 아는 사람이 접근 권한을 가로챌 수 있습니다.

알림을 누르면 \`/\`로 열리고, 스플래시가 \`localStorage\`의 \`waitlist_phone\`으로
\`GET /api/waitlist/status\`를 조회해 \`approved\`면 로그인 화면으로 보냅니다.
**토큰 없이도 진입이 됩니다** — 이미 구현돼 있는 경로입니다.

실제 접근 통제는 Google Cloud OAuth 테스트 사용자 목록에서 이뤄집니다. 목록에 없는
계정은 구글이 로그인을 막으므로, 백엔드가 따로 검증하지 않습니다.

## 호출 시점

- **iOS** — 홈 화면에 추가한 앱을 실행했을 때 (사파리 탭에서는 권한 요청이 불가능)
- **Android** — 사전등록 완료 직후 바로

권한 거부는 되돌리기 어려우므로, 커스텀 모달로 의사를 먼저 확인한 뒤 시스템 팝업을 띄우세요.`,
  })
  @ApiResponse({ status: 200, schema: { example: { status: 'subscribed' } } })
  @ApiResponse({ status: 404, description: '이름·전화번호가 일치하는 사전등록 건 없음' })
  subscribe(@Body() dto: SubscribePushDto) {
    return this.pushService.subscribe(dto);
  }

  @Post('link-user')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({
    summary: '로그인 후 구독을 유저에 연결',
    description: '로그인 성공 직후 기기의 pushManager.getSubscription() endpoint를 전달하면 해당 구독의 userId를 갱신합니다. 분석 완료 푸시 등 로그인 이후 알림에 필요합니다.',
  })
  @ApiResponse({ status: 200, schema: { example: { status: 'linked' } } })
  async linkUser(
    @Body('endpoint') endpoint: string,
    @Req() req: Request,
  ): Promise<{ status: string }> {
    const userId = (req['user'] as AuthUser).sub;
    await this.pushService.linkToUser(endpoint ?? '', userId);
    return { status: 'linked' };
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
