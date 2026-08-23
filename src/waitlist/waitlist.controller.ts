import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { ApproveWaitlistDto } from './dto/approve-waitlist.dto';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { WaitlistService } from './waitlist.service';

@ApiTags('Waitlist | 사전 등록')
@Controller('waitlist')
@UseGuards(RateLimitGuard)
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @HttpCode(201)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({ summary: '사전 등록' })
  @ApiResponse({ status: 201, description: '등록 완료' })
  @ApiResponse({ status: 409, description: '이미 등록된 번호' })
  register(@Body() dto: CreateWaitlistDto) {
    return this.waitlistService.register(dto);
  }

  @Get('status')
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({
    summary: '등록 상태 조회 — 승인 여부 확인의 기본 경로',
    description: `사전등록 시 저장해둔 전화번호(\`localStorage\`의 \`waitlist_phone\`)로 조회합니다.

**\`approved\`면 로그인 화면으로 보내면 됩니다.** 접근 토큰은 필요 없습니다.
실제 접근 통제는 Google Cloud OAuth 테스트 사용자 목록에서 이뤄지므로, 목록에 없는
계정은 구글이 로그인 단계에서 막습니다.

\`GET /waitlist/verify\`의 토큰 방식은 알림톡 링크로 진입하던 시절의 경로입니다.
알림 채널이 웹 푸시로 바뀌면서 푸시에는 토큰을 담지 않으므로, 승인 확인은 이
엔드포인트를 쓰세요.

상태값은 \`pending\` · \`approved\` · \`not_found\` 세 가지입니다.`,
  })
  @ApiResponse({ status: 200, schema: { example: { status: 'approved' } } })
  getStatus(@Query('phone') phone: string) {
    return this.waitlistService.getStatus(phone);
  }

  @Get('verify')
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({
    summary: '알림톡 토큰 검증',
    description: `알림톡 링크의 \`token\` 파라미터를 검증합니다.

**성공 후 플로우**: \`{ approved: true }\` 응답 시 \`GET /auth/google\`로 이동해 Google OAuth 시작.
토큰을 sessionStorage에 저장해두고 \`/auth/callback\` 도달 후 회원가입 완료 처리.`,
  })
  @ApiResponse({ status: 200, description: '토큰 유효 — 이후 /auth/google로 이동' })
  @ApiResponse({ status: 400, description: 'expired_token' })
  @ApiResponse({ status: 404, description: 'invalid_token' })
  verifyToken(@Query('token') token: string) {
    return this.waitlistService.verifyToken(token);
  }
}

@ApiTags('Waitlist | 사전 등록')
@Controller('admin/waitlist')
@UseGuards(RateLimitGuard)
export class AdminWaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post('approve')
  @HttpCode(200)
  @ApiOperation({ summary: '[Admin] 대기자 승인 + 알림톡 발송' })
  @ApiHeader({ name: 'Authorization', description: 'Bearer <ADMIN_SECRET>' })
  @ApiResponse({ status: 200, description: '승인 완료' })
  @ApiResponse({ status: 401, description: '인증 실패' })
  approve(
    @Body() dto: ApproveWaitlistDto,
    @Headers('authorization') auth: string,
  ) {
    return this.waitlistService.approve(dto, auth);
  }
}
