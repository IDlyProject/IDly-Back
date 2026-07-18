import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BetaService } from './beta.service';
import { CreateBetaApplicantDto } from './dto/create-beta-applicant.dto';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@ApiTags('랜딩 | 베타 신청')
@Controller('beta')
@UseGuards(RateLimitGuard)
export class BetaController {
  constructor(private readonly betaService: BetaService) {}

  @Post()
  @HttpCode(201)
  @RateLimit({ limit: 5, windowMs: 60 * 60 * 1000, key: 'ip' }) // IP당 1시간 5회
  @ApiOperation({
    summary: '베타 테스터 신청',
    description:
      '이메일·전화번호를 저장합니다. 동일 이메일 중복 신청 시 409. IP당 시간당 5회 제한.',
  })
  @ApiResponse({ status: 201, description: '신청 완료' })
  @ApiResponse({ status: 409, description: '이미 신청된 이메일' })
  @ApiResponse({ status: 429, description: '요청 제한 초과' })
  apply(@Body() dto: CreateBetaApplicantDto) {
    return this.betaService.apply(dto);
  }
}
