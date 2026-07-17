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
    summary: '이번 달 보안 조치 현황 — 완료/진행중/대기 집계 + 서비스별 체크리스트',
    description: `조치 항목(ActionItem) 기준 이번 달 보안 조치 트래커를 반환합니다.

**포함 항목**
- \`month\`: 조회 기준 연월 (YYYY-MM)
- \`progress\`: 전체 조치 집계 \`{ done, inProgress, pending }\`
- \`services[]\`: 조치 항목이 있는 서비스 목록. 서비스별 \`actions[]\`에 각 항목의 \`status\`·\`updatedAt\` 포함`,
  })
  @ApiResponse({ status: 200, description: '월별 보안 정리 데이터' })
  getSummary(@Req() req) {
    return this.summaryService.getSummary(req.user.sub);
  }
}
