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
    summary: '이번 달 보안 조치 현황 — 완료/건너뜀/대기 집계 + 서비스별 체크리스트',
    description: `ActionItem 기준 이번 달 보안 조치 트래커를 반환합니다.

---

**[프론트 계약]**

**progress 버킷**
\`\`\`
{ done, skipped, pending }
\`\`\`
- ActionItem status는 \`pending | done | skipped\` 3종. \`in_progress\` 없음
- UI 「진행중」 칸: \`skipped\`를 매핑하거나 0/숨김 처리 필요
- UI 「완료」 → done, 「건너뜀」 → skipped, 「대기」 → pending 권장

**월 필터 정책**
- \`done\` / \`skipped\`: 이번 달 \`updatedAt\` 기준으로 집계
- \`pending\`: 월 무관 항상 포함 — 지난달 미완 백로그도 표시됨 (의도적)

**mailAccounts[] — 계정 필터 드롭다운**
- 응답 최상위 \`mailAccounts[]\`에 연결된 Gmail 계정 전체 목록 포함
- 각 service에 \`sourceMailAccount: { id, email, label }\` 포함
- 「전체 계정」 드롭다운은 이 목록으로 구성, 필터링은 front에서 \`sourceMailAccount.id\`로 처리

**services[] 정렬**
- pending 조치가 많은 서비스 우선 정렬
- actionItems가 없는 서비스(조치 불필요)는 제외됨

---

**포함 항목**
- \`month\`: 조회 기준 연월 (YYYY-MM)
- \`progress\`: { done, skipped, pending } — 이번 달 조치 집계
- \`mailAccounts[]\`: { id, email, label } — Gmail 계정 필터용
- \`services[]\`: 조치 항목이 있는 서비스 목록. 각 서비스에 \`sourceMailAccount\`·\`actions[]\` 포함
  - \`actions[].status\`: pending | done | skipped
  - \`actions[].updatedAt\`: ISO 8601`,
  })
  @ApiResponse({ status: 200, description: '월별 보안 정리 데이터' })
  getSummary(@Req() req) {
    return this.summaryService.getSummary(req.user.sub);
  }
}
