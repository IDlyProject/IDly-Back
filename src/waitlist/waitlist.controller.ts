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
@Controller()
@UseGuards(RateLimitGuard)
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post('waitlist')
  @HttpCode(201)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({ summary: '사전 등록' })
  @ApiResponse({ status: 201, description: '등록 완료' })
  @ApiResponse({ status: 409, description: '이미 등록된 번호' })
  register(@Body() dto: CreateWaitlistDto) {
    return this.waitlistService.register(dto);
  }

  @Get('waitlist/status')
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({ summary: '등록 상태 조회' })
  @ApiResponse({ status: 200, description: 'pending | approved | not_found' })
  getStatus(@Query('phone') phone: string) {
    return this.waitlistService.getStatus(phone);
  }

  @Get('waitlist/verify')
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

  @Post('admin/waitlist/approve')
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
