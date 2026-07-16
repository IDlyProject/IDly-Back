import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { AnalysisService } from './analysis.service';
import { JwtGuard } from '../auth/jwt.guard';

class StartAnalysisDto {
  @ApiProperty({
    example: ['gmail-account-id-1'],
    description: '분석할 Gmail 계정 ID 배열. 생략 시 전체 계정 대상',
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mailAccountIds?: string[];
}

@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('start')
  @ApiTags('1-2. 회원가입')
  @ApiOperation({
    summary: '분석 시작 — analysisId 즉시 반환, 실제 분석은 백그라운드 실행',
    description: `Gmail mbox 수집 → AI 분석 파이프라인을 시작합니다.

\`analysisId\`를 즉시 반환하고, 분석은 백그라운드에서 처리됩니다.
완료 여부는 **GET /:analysisId/status** 로 폴링하세요.

- \`mailAccountIds\` 생략 시 전체 연결 계정 대상
- 이미 진행 중인 분석이 있으면 기존 \`analysisId\` 반환`,
  })
  @ApiBody({ type: StartAnalysisDto, required: false })
  @ApiResponse({ status: 201, description: '분석 시작됨', schema: { example: { analysisId: 'run-uuid', status: 'queued' } } })
  start(@Req() req, @Body() body: StartAnalysisDto = {}) {
    return this.analysisService.startAnalysis(req.user.sub, body.mailAccountIds);
  }

  @Get(':analysisId/status')
  @ApiTags('2-1. 홈 화면')
  @ApiOperation({
    summary: '분석 상태 폴링 — completed 수신 시 홈으로 이동',
    description: `분석 진행 상태를 반환합니다. 프론트에서 주기적으로 폴링하세요.

**status 값**
- \`queued\`: 대기 중
- \`scanning\`: 분석 중
- \`completed\`: 완료 → 홈 화면으로 이동
- \`failed\`: 실패`,
  })
  @ApiParam({ name: 'analysisId', description: 'start 응답의 analysisId' })
  @ApiResponse({ status: 200, description: '분석 상태', schema: { example: { analysisId: 'run-uuid', status: 'scanning', progress: 42 } } })
  getStatus(@Param('analysisId') analysisId: string) {
    return this.analysisService.getStatus(analysisId);
  }
}
