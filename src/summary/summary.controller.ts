import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SummaryService } from './summary.service';
import { JwtGuard } from '../auth/jwt.guard';

@ApiTags('3-1. 정리 화면')
@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('summary')
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get()
  @ApiOperation({
    summary: '월별 보안 정리 — 이번 달 위험 서비스 목록',
    description: `이번 달 기준으로 위험도가 있는 서비스 계정 목록을 위험도순으로 반환합니다.

**정렬 기준**: high → medium → low → safe 순

**포함 항목**
- \`month\`: 조회 기준 연월 (YYYY-MM)
- \`securityScore\`: 전체 보안 점수 (0–100)
- \`totalServices\` / \`riskyServices\`: 전체 / 위험 서비스 수
- \`accounts[]\`: 서비스별 요약. 이번 달 위험 근거 메일(\`recentEvidences\`), 필수 조치 여부(\`hasRequiredAction\`) 포함`,
  })
  @ApiResponse({ status: 200, description: '월별 보안 정리 데이터' })
  getSummary(@Req() req) {
    return this.summaryService.getSummary(req.user.sub);
  }
}
