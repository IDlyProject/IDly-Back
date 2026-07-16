import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HomeService } from './home.service';
import { JwtGuard } from '../auth/jwt.guard';

@ApiTags('2-1. 홈 화면')
@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  @ApiOperation({
    summary: '홈 데이터 조회 — 서비스 계정 카드, 보안 점수, 카드뉴스',
    description: `로그인 유저의 홈 화면 데이터를 한 번에 반환합니다.

**응답 포함 항목**
- \`userName\`: 유저 이름
- \`backgroundAnalysis\`: 현재 진행 중인 분석 상태 (\`idle\` / \`scanning\` / \`failed\`)
- \`metrics\`: 총 서비스 계정 수, 조치 필요 수, 보안 점수
- \`riskSummary\`: 가장 긴급한 위험 요약 또는 안전 메시지
- \`serviceAccounts[]\`: 홈 카드 목록 (휴면 계정 제외)
- \`cardNews[]\`: 카드뉴스 목록`,
  })
  @ApiQuery({ name: 'mailAccountId', required: false, description: '특정 Gmail 필터 (생략 시 전체)' })
  @ApiResponse({ status: 200, description: '홈 데이터 (서비스 계정 카드, 보안 점수, 카드뉴스 포함)' })
  getHome(@Req() req, @Query('mailAccountId') mailAccountId?: string) {
    return this.homeService.getHome(req.user.sub, mailAccountId ?? 'all');
  }
}
