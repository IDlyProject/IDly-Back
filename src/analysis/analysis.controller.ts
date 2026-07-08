import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnalysisService } from './analysis.service';
import { JwtGuard } from '../auth/jwt.guard';
import { AnalysisRunDto, AnalysisRunStatusDto } from '../common/dto/response.dto';

@ApiTags('Analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('trigger')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[화면 07] 분석 진행 — 분석 시작',
    description: `
**화면 06 → 07 전환 시 호출**

계정 등록 완료 후 "분석 시작하기" 버튼 클릭 시 호출.
모든 연결된 Gmail에서 보안 메일을 가져와 AI 분석을 트리거합니다.

- \`runId\`를 즉시 반환하고 분석은 **비동기**로 실행
- 프론트는 \`runId\`로 상태를 폴링하다가 \`completed\`가 되면 홈(화면 08)으로 이동
- \`failed\` 수신 시 동일 화면에서 재시도 CTA 노출

상태 흐름: \`queued\` → \`scanning\` → \`completed\` / \`failed\`
    `.trim(),
  })
  @ApiResponse({ status: 201, type: AnalysisRunDto, description: '분석 시작됨 — runId로 상태 폴링' })
  triggerAnalysis(@Req() req) {
    return this.analysisService.triggerAnalysis(req.user.sub);
  }

  @Get('runs/:runId')
  @UseGuards(JwtGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[화면 07] 분석 진행 — 상태 폴링',
    description: `
**화면 07 (분석 진행 중) 에서 주기적으로 호출**

분석 상태를 폴링합니다. \`completed\` 수신 시 프론트가 홈(화면 08)으로 자동 전환.

| status | 화면 표시 |
|---|---|
| \`queued\` | 대기 중 |
| \`scanning\` | Gmail 확인 중 / 계정 알림 정리 중 / 홈 준비 중 |
| \`completed\` | → 홈(08)으로 자동 이동 |
| \`failed\` | 실패 안내 + 재시도 CTA |
    `.trim(),
  })
  @ApiParam({ name: 'runId', description: 'trigger 응답의 runId' })
  @ApiResponse({ status: 200, type: AnalysisRunStatusDto, description: '분석 상태' })
  getRunStatus(@Req() req, @Param('runId') runId: string) {
    return this.analysisService.getRunStatus(runId, req.user.sub);
  }
}
