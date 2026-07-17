import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { JwtGuard } from '../auth/jwt.guard';

@ApiTags('2-4. 전체 보안 리포트')
@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('report')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  @ApiOperation({
    summary: '전체 보안 리포트 — Solar 가공 결과 포함',
    description: `최근 완료된 분석의 보안 리포트를 반환합니다.

**Solar 가공 결과 활용**
- 분석 완료 후 Solar가 생성한 reportSnapshot을 읽어 \`scoreDescription\`, 서비스별 \`headline\`·\`reason\`, 위험 이벤트 \`title\`·\`description\`을 반환합니다.
- reportSnapshot이 없거나 무효화된 경우 DB 원본값과 룰 기반 텍스트로 대체됩니다.

**포함 항목**
- \`securityScore\`: 전체 보안 점수 (0-100)
- \`grade\`: 등급 — 양호(≥80) / 주의(≥60) / 위험(else)
- \`scoreDescription\`: 점수에 맞는 한 줄 설명 (Solar 또는 룰 fallback)
- \`hasAiSnapshot\`: Solar 가공 결과 적용 여부
- \`riskCounts\`: { high, medium, low, safe } — 4단계 세분화
- \`summaryCounts\`: { danger, caution, safe } — UI 3카드 직접 매핑. caution = medium + low
- \`riskEvents[]\`: 전체 위험 근거 flat 리스트 (receivedAt desc, 최대 10개). Solar 매핑 title·description 포함
- \`analyzedAt\`: 마지막 분석 완료 시각
- \`services[]\`: 위험 서비스 목록 (위험도순). safe 제외. 각 서비스에 \`evidences[]\`·\`actionItems[]\` 포함`,
  })
  @ApiResponse({ status: 200, description: '전체 보안 리포트' })
  getReport(@Req() req) {
    return this.reportService.getReport(req.user.sub);
  }
}
