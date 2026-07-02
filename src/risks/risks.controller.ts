import { Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RisksService } from './risks.service';
import { JwtGuard } from '../auth/jwt.guard';
import { ActionItemDto, ServiceAccountDto } from '../common/dto/response.dto';

@ApiTags('risks')
@ApiBearerAuth('access-token')
@Controller('risks')
@UseGuards(JwtGuard)
export class RisksController {
  constructor(private readonly risksService: RisksService) {}

  @Get()
  @ApiOperation({
    summary: '[화면 08] 홈 — 위험 서비스 목록',
    description: `
**화면 08 · 홈 (계정아파트)**

\`gmailAccountId\` 없이 호출하면 전체 계정의 위험 서비스를 반환합니다.
이메일 필터 칩("전체 ▾" → 특정 계정 선택)을 누르면 \`gmailAccountId\`를 붙여 재조회합니다.

**응답 포함 정보**
- \`serviceName\`: 서비스 이름 (예: Disney+, Netflix)
- \`riskStatus\`: \`warning\` | \`danger\`
- \`riskEvents[0]\`: 가장 최근 미처리 이벤트 + \`actionItems\` 목록
- \`gmailAccount.email\`: 어느 Gmail 계정에서 감지됐는지
    `.trim(),
  })
  @ApiQuery({ name: 'gmailAccountId', required: false, description: '특정 Gmail 계정 ID로 필터링 (미입력 시 전체)' })
  @ApiResponse({ status: 200, type: [ServiceAccountDto], description: '위험 서비스 목록' })
  getRisks(@Req() req, @Query('gmailAccountId') gmailAccountId?: string) {
    return this.risksService.getRisksByEmail(req.user.sub, gmailAccountId);
  }

  @Get('services/:serviceAccountId')
  @ApiOperation({
    summary: '[화면 09] 문제 상세 — 서비스 상세 + 감지된 신호',
    description: `
**화면 09 · 문제 상세**

홈에서 서비스 카드를 탭하면 호출됩니다.

**응답 포함 정보**
- \`serviceName\`, \`riskStatus\`, \`lastAnalyzedAt\`
- \`riskEvents[]\`: 미처리 이벤트 목록 (severity 내림차순)
  - \`riskType\`: 위험 유형 (예: \`new_device_login\`, \`password_reset\`)
  - \`severity\`: \`low\` | \`medium\` | \`high\`
  - \`evidenceEmails\`: 근거 메일 목록 (감지된 신호 — 접기/펼치기)
  - \`actionItems[]\`: 대응 단계 목록
    `.trim(),
  })
  @ApiParam({ name: 'serviceAccountId', description: 'ServiceAccount ID' })
  @ApiResponse({ status: 200, type: ServiceAccountDto, description: '서비스 상세 + 감지된 신호 + 조치 목록' })
  getDetail(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.getServiceDetail(id, req.user.sub);
  }

  @Get('services/:serviceAccountId/actions')
  @ApiOperation({
    summary: '[화면 10] 대응 안내 — 조치 목록',
    description: `
**화면 10 · 대응 안내 (체크리스트)**

화면 09에서 "대응 방법 보기" CTA 클릭 시 호출됩니다.

**응답 포함 정보**
- \`id\`: 조치 항목 ID (done/skip 처리 시 사용)
- \`label\`: 조치 내용 (예: "비밀번호 변경")
- \`isRequired\`: \`true\` → 필수 배지(빨강), \`false\` → 권장 배지(회색)
- \`status\`: \`pending\` | \`done\` | \`skipped\`
- \`riskEvent.riskType\`, \`riskEvent.severity\`

필수 항목 우선, severity 높은 순으로 정렬됩니다.
    `.trim(),
  })
  @ApiParam({ name: 'serviceAccountId', description: 'ServiceAccount ID' })
  @ApiResponse({ status: 200, type: [ActionItemDto], description: '조치 항목 목록' })
  getActions(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.getActionItems(id, req.user.sub);
  }

  @Patch('actions/:actionItemId/done')
  @ApiOperation({
    summary: '[화면 10-3] 조치 완료 처리',
    description: `
**화면 10-3 · 조치 완료**

"조치 완료로 표시" 버튼 클릭 시 호출됩니다.
해당 ActionItem의 \`status\`를 \`done\`으로 변경합니다.

모든 필수 항목이 \`done\`이 되면 프론트에서 완료 모달(화면 10-4)을 표시합니다.
    `.trim(),
  })
  @ApiParam({ name: 'actionItemId', description: 'ActionItem ID' })
  @ApiResponse({ status: 200, type: ActionItemDto, description: 'status가 done으로 변경된 조치 항목' })
  markDone(@Req() req, @Param('actionItemId') id: string) {
    return this.risksService.markActionDone(id, req.user.sub);
  }

  @Patch('actions/:actionItemId/skip')
  @ApiOperation({
    summary: '[화면 10] 조치 건너뛰기',
    description: `
**화면 10 · "조치하지 않고 넘어가기"**

해당 ActionItem의 \`status\`를 \`skipped\`으로 변경합니다.
스와이프로 지운 항목에 해당합니다.
    `.trim(),
  })
  @ApiParam({ name: 'actionItemId', description: 'ActionItem ID' })
  @ApiResponse({ status: 200, type: ActionItemDto, description: 'status가 skipped으로 변경된 조치 항목' })
  skipAction(@Req() req, @Param('actionItemId') id: string) {
    return this.risksService.skipAction(id, req.user.sub);
  }

  @Patch('events/:riskEventId/resolve')
  @ApiOperation({
    summary: '[화면 10-4] 완료 모달 확인 — 리스크 이벤트 resolve',
    description: `
**화면 10-4 · 조치 완료 확인 모달**

"홈에서 변경 확인하기" 또는 "다음 조치 확인하기" 버튼 클릭 시 호출됩니다.
RiskEvent의 \`status\`를 \`resolved\`, \`resolvedAt\`을 현재 시각으로 업데이트합니다.

이후 홈(08) 조회 시 해당 서비스는 위험 목록에서 제외됩니다.
    `.trim(),
  })
  @ApiParam({ name: 'riskEventId', description: 'RiskEvent ID' })
  @ApiResponse({ status: 200, description: 'status: resolved, resolvedAt 설정됨' })
  resolveEvent(@Req() req, @Param('riskEventId') id: string) {
    return this.risksService.resolveRiskEvent(id, req.user.sub);
  }
}
