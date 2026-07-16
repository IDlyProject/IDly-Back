import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HomeService } from './home.service';
import { JwtGuard } from '../auth/jwt.guard';
import { HomeResponseDto } from './dto/home-response.dto';

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

**AI 분석 결과 반영 방식**
- AI 서버 \`POST /analyze\` 응답의 \`accounts[]\`를 서비스 계정 단위로 저장합니다.
- AI 응답 필드 중 \`account\`는 서비스 식별/표시명, \`security_level\`·\`security_score\`는 \`riskLevel\`·\`status\`, \`interpretation\`은 카드 요약/해석, \`problem_mails[]\`는 위험 근거 메일로 가공됩니다.
- 홈 API는 DB에 저장된 \`ServiceAccount\`들을 Gmail 계정별로 모아 카드 목록을 만듭니다.
- 저장된 \`riskLevel\`과 \`status\`를 기반으로 조치 필요 개수, 보안 점수, 최우선 위험 요약을 계산합니다.
- \`status=dormant\` 또는 \`status=skipped\`인 서비스 계정은 홈 카드와 보안 점수 계산에서 제외됩니다.

**응답 포함 항목**
- \`userName\`: 유저 이름
- \`backgroundAnalysis\`: 현재 진행 중인 분석 상태 (\`idle\` / \`scanning\` / \`failed\`)
- \`mailAccounts[]\`: Gmail 드롭다운 항목
- \`metrics\`: 총 서비스 계정 수, 조치 필요 수, 보안 점수
- \`riskSummary\`: 가장 긴급한 위험 요약 또는 안전 메시지
- \`serviceAccounts[]\`: 홈 카드 목록. 각 카드에 \`sourceMailAccount\`와 서비스 로고용 \`iconUrl\`/\`iconLabel\` 포함
- \`cardNews[]\`: 카드뉴스 목록`,
  })
  @ApiQuery({
    name: 'mailAccountId',
    required: false,
    description: '특정 Gmail 필터 (생략 시 전체)',
  })
  @ApiResponse({
    status: 200,
    type: HomeResponseDto,
    description: '홈 데이터 (서비스 계정 카드, 보안 점수, 카드뉴스 포함)',
  })
  getHome(@Req() req, @Query('mailAccountId') mailAccountId?: string) {
    return this.homeService.getHome(req.user.sub, mailAccountId ?? 'all');
  }
}
