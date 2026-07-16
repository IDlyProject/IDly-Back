import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { GmailService } from './gmail.service';

@ApiTags('gmail')
@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('gmail')
export class GmailController {
  constructor(private readonly gmailService: GmailService) {}

  @Post('accounts/:gmailAccountId/sync')
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: '[화면 06] Gmail .mbox 동기화',
    description: `
**화면 06 · 메일 데이터 수집**

지정한 Gmail 계정의 전체 메일을 .mbox 형식으로 수집합니다.
수집 완료 후 AI 분석 트리거에 사용됩니다.

- 메일 수가 많을 경우 수 분 소요될 수 있습니다
- 완료 시 \`lastSyncedAt\`이 갱신됩니다
    `.trim(),
  })
  @ApiParam({ name: 'gmailAccountId', description: 'GET /api/users/me 응답의 gmailAccounts[].id' })
  @ApiResponse({ status: 201, schema: { example: { count: 1234, gmailAccountId: 'uuid', sizeBytes: 12345678 } } })
  async syncAccount(@Req() req, @Param('gmailAccountId') gmailAccountId: string) {
    const { count, sizeBytes } = await this.gmailService.fetchAllEmailsAsMbox(
      gmailAccountId,
      req.user.sub,
    );
    return { count, gmailAccountId, sizeBytes };
  }
}
