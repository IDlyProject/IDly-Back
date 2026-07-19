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
    summary: '이번 달 보안 조치 현황 — 완료/대기 집계 + 서비스별 체크리스트',
    description: `ActionItem 기준 이번 달 보안 조치 트래커를 반환합니다.

---

**[프론트 계약]**

**progress 버킷**
\`\`\`
{ done, pending }
\`\`\`
- UI 「완료」 → \`done\`
- UI 「대기」 → \`pending\`
- 현재 디자인에서 조치 건너뛰기 기능이 제거되어 \`skipped\`는 응답/집계에서 제외됩니다.
- 기존 DB에 남아 있는 과거 \`skipped\` actionItem도 정리 화면에는 노출하지 않습니다.

**월 필터 정책**
- \`done\`: 이번 달 \`updatedAt\` 기준으로 집계
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
- \`progress\`: { done, pending } — 이번 달 조치 집계
- \`mailAccounts[]\`: { id, email, label } — Gmail 계정 필터용
- \`services[]\`: 조치 항목이 있는 서비스 목록. 각 서비스에 \`sourceMailAccount\`·\`actions[]\` 포함
  - \`actions[].status\`: pending | done
  - \`actions[].updatedAt\`: ISO 8601`,
  })
  @ApiResponse({
    status: 200,
    description: '월별 보안 정리 데이터',
    schema: {
      example: {
        month: '2026-07',
        progress: { done: 3, pending: 4 },
        mailAccounts: [{ id: 'ga-uuid', email: 'user@gmail.com', label: 'Gmail동' }],
        services: [
          {
            id: 'sa-uuid',
            serviceName: 'Twitter',
            iconUrl: null,
            iconLabel: 'T',
            riskLevel: 'high',
            status: 'action_required',
            sourceMailAccount: { id: 'ga-uuid', email: 'user@gmail.com', label: 'Gmail동' },
            actions: [
              {
                id: 'action-item-uuid',
                title: '비밀번호 변경하기',
                status: 'pending',
                updatedAt: '2026-07-18T10:00:00.000Z',
              },
            ],
          },
        ],
      },
    },
  })
  getSummary(@Req() req) {
    return this.summaryService.getSummary(req.user.sub);
  }
}
