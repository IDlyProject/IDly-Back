import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { AnalysisService } from './analysis.service';
import { JwtGuard } from '../auth/jwt.guard';
import {
  AnalysisStatusResponseDto,
  StartAnalysisResponseDto,
} from './dto/analysis-response.dto';

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
- 이미 진행 중인 분석이 있으면 기존 \`analysisId\` 반환

**분석 결과 반영 흐름**
1. Gmail 계정별 mbox 수집
2. AI 서버 분석 결과 수신
3. 서비스 계정별 \`riskLevel\`, \`status\`, \`primaryRiskType\`, 근거 메일, 조치 가이드 저장
4. 홈 화면은 \`GET /api/home\`에서 저장된 서비스 계정 결과를 다시 집계해 카드·점수·위험요약으로 반환`,
  })
  @ApiBody({ type: StartAnalysisDto, required: false })
  @ApiResponse({
    status: 201,
    type: StartAnalysisResponseDto,
    description: '분석 시작됨',
  })
  start(@Req() req, @Body() body: StartAnalysisDto = {}) {
    return this.analysisService.startAnalysis(
      req.user.sub,
      body.mailAccountIds,
    );
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
- \`failed\`: 실패

**화면 처리 기준**
- \`queued\` / \`scanning\`: \`progress\`, \`currentStep\`, \`displayMessage\`로 로딩 화면 표시
- \`completed\`: \`GET /api/home\` 호출 후 홈 화면 렌더링
- \`failed\`: \`errorMessage\` 또는 \`displayMessage\`를 보여주고 재시도 유도

**currentStep 값**
- \`waiting\`: 분석 준비
- \`checking_connected_mail\`: 연결 Gmail 확인
- \`collecting_account_signals\`: 계정 보안 신호 수집
- \`preparing_home\`: 홈 화면 데이터 저장/집계 준비
- \`completed\`: 완료
- \`failed\`: 실패`,
  })
  @ApiParam({ name: 'analysisId', description: 'start 응답의 analysisId' })
  @ApiResponse({
    status: 200,
    type: AnalysisStatusResponseDto,
    description: '분석 진행 상태',
  })
  getStatus(@Req() req, @Param('analysisId') analysisId: string) {
    return this.analysisService.getStatus(analysisId, req.user.sub);
  }
}
