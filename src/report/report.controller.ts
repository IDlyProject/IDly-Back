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

---

**[프론트 계약]**

**grade 임계값**
\`\`\`
securityScore ≥ 80 → "양호"
securityScore ≥ 60 → "주의"
else              → "위험"
\`\`\`

**riskCounts vs summaryCounts**
- \`riskCounts\`: { high, medium, low, safe } — 4단계 원본 수치
- \`summaryCounts\`: { danger, caution, safe } — UI 3카드 직접 매핑용
  - danger  = high
  - caution = medium + low
  - safe    = safe

**riskEvents[] flat 타임라인**
- 서비스 비종속 위험 근거 flat 리스트. receivedAt desc, 최대 10개
- \`title\`·\`description\`: Solar 가공 결과 → 없으면 메일 subject·summary fallback
- UI 2-4 하단 「주요 위험 항목」 타임라인에 직접 사용

**hasAiSnapshot / Solar 비동기**
- 분석 완료 즉시 \`status=completed\`가 반환되고, Solar snapshot은 수 초 후 비동기 patch됨
- 분석 직후 GET /report 시 \`hasAiSnapshot: false\`일 수 있음 — 짧은 폴링 또는 재조회 필요
- 사용자가 조치/휴면 처리 후에는 snapshot이 무효화되어 \`hasAiSnapshot: false\` + 룰 fallback 사용

**snapshot 범위**
- snapshot은 특정 분석 run이 아닌 **userId 전체** ServiceAccount 기준으로 생성됨
- 부분 Gmail 재분석 후에도 리포트는 전체 보안 현황을 반영

---

**포함 항목**
- \`securityScore\`: 전체 보안 점수 (0–100)
- \`grade\`: 양호 / 주의 / 위험
- \`scoreDescription\`: 점수 한 줄 설명 (Solar → 룰 fallback 순)
- \`hasAiSnapshot\`: Solar 가공 결과 적용 여부
- \`riskCounts\`: { high, medium, low, safe }
- \`summaryCounts\`: { danger, caution, safe }
- \`riskEvents[]\`: 위험 근거 flat 리스트 (receivedAt desc, 최대 10개)
- \`analyzedAt\`: 마지막 분석 완료 시각 (ISO 8601)
- \`services[]\`: 위험 서비스 목록 (위험도순, safe 제외). 각 서비스에 \`evidences[]\`·\`actionItems[]\` 포함`,
  })
  @ApiResponse({ status: 200, description: '전체 보안 리포트' })
  getReport(@Req() req) {
    return this.reportService.getReport(req.user.sub);
  }
}
