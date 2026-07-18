import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { SecurityChatService } from './security-chat.service';
import { JwtGuard } from '../auth/jwt.guard';
import { PerUserThrottleGuard } from '../common/guards/per-user-throttle.guard';

class SendSecurityChatDto {
  @ApiProperty({ example: '비밀번호 어떻게 바꿔요?' })
  @IsString()
  @MaxLength(1000)
  message: string;
}

@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@ApiTags('2-4. 보안 도우미')
@Controller('security-chat')
export class SecurityChatController {
  constructor(private readonly securityChatService: SecurityChatService) {}

  @Get()
  @ApiOperation({
    summary: '보안 도우미 채팅 조회 (또는 생성)',
    description: `유저의 보안 도우미 채팅 세션을 반환합니다. 없으면 자동 생성됩니다.`,
  })
  @ApiResponse({ status: 200, description: '채팅 히스토리' })
  getChat(@Req() req) {
    return this.securityChatService.getOrCreateChat(req.user.sub);
  }

  @Post('messages')
  @HttpCode(200)
  @UseGuards(PerUserThrottleGuard)
  @ApiOperation({
    summary: '보안 도우미 메시지 전송',
    description: `자유 텍스트 메시지를 전송하면 LLM이 컨텍스트를 파악해 답변합니다.

**응답에 포함될 수 있는 rich 메시지 타입**
- \`text\`: 일반 텍스트 답변
- \`action_list\`: 조치가 필요한 항목 목록 (metadata.actionList.items)
- \`official_link\`: 공식 페이지 링크 카드 (metadata.externalCard)
- \`card_news\`: 보안 카드뉴스 (metadata.cardNews)
- \`exit_cta\`: 이동 버튼 목록 (metadata.exitCtas)`,
  })
  @ApiBody({ type: SendSecurityChatDto })
  @ApiResponse({ status: 200, description: '메시지 처리 결과' })
  sendMessage(@Req() req, @Body() body: SendSecurityChatDto) {
    return this.securityChatService.sendMessage(req.user.sub, body.message);
  }
}
