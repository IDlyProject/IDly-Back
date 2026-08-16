import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackService } from './feedback.service';

@ApiTags('피드백')
@Controller('feedback')
@UseGuards(RateLimitGuard)
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  @HttpCode(204)
  @RateLimit({ limit: 3, windowMs: 60 * 60 * 1000, key: 'ip' })
  @ApiOperation({
    summary: '버그/피드백 제보',
    description: `앱 내 플로팅 버튼에서 호출. 로그인 여부와 무관하게 동작합니다.
JWT가 헤더에 있으면 유저 이메일을 자동 첨부하고, 없으면 익명으로 제보됩니다.`,
  })
  @ApiResponse({ status: 204, description: '제보 완료' })
  @ApiResponse({ status: 429, description: '시간당 3회 초과' })
  async submit(@Body() dto: CreateFeedbackDto, @Req() req: Request): Promise<void> {
    const userEmail = this.extractEmail(req);
    await this.feedbackService.send(dto, userEmail);
  }

  private extractEmail(req: Request): string | null {
    try {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) return null;
      const token = auth.slice(7);
      const payload = this.jwtService.verify(token) as { email?: string };
      return payload?.email ?? null;
    } catch {
      return null;
    }
  }
}
