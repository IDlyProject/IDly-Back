import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { SecurityChatService } from './security-chat.service';
import { JwtGuard } from '../auth/jwt.guard';
import { PerUserThrottleGuard } from '../common/guards/per-user-throttle.guard';

class SendSecurityChatDto {
  @ApiProperty({
    example: 'Twitter 비밀번호는 어디서 바꾸면 돼? 공식 링크랑 같이 알려줘',
    description:
      '보안 도우미에게 보낼 자유 텍스트입니다. 비밀번호, 인증코드, 카드번호 같은 민감정보는 저장/전송 전에 차단됩니다. 최대 1000자.',
    maxLength: 1000,
  })
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
    summary: '보안 도우미 채팅 조회 — 2-4 히스토리 복원',
    description: `2-4 보안 도우미 화면 진입 시 사용합니다.

**화면 매칭**
- 기존 대화가 있으면 최근 메시지를 시간순으로 반환합니다.
- 대화가 없으면 유저별 보안 도우미 채팅을 자동 생성하고 빈 \`messages[]\`를 반환합니다.
- \`messages[].type\`에 따라 프론트는 텍스트 버블, 공식 링크 카드, 카드뉴스, 종료 CTA를 렌더링합니다.

**메시지 타입**
- \`text\`: 일반 챗봇 말풍선
- \`action_list\`: 조치 필요 계정/항목 목록
- \`official_link\`: 공식 페이지 이동 카드
- \`card_news\`: 보안 팁 카드뉴스
- \`exit_cta\`: 홈/다음 조치/리포트 이동 버튼`,
  })
  @ApiResponse({
    status: 200,
    description: '채팅 히스토리',
    schema: {
      example: {
        chatId: 'chat-uuid',
        messages: [
          {
            id: 'message-uuid',
            role: 'assistant',
            type: 'text',
            text: 'Twitter 비밀번호 변경은 공식 설정 페이지에서 진행할 수 있어요.',
            createdAt: '2026-07-19T01:00:00.000Z',
          },
          {
            id: 'message-uuid-2',
            role: 'assistant',
            type: 'official_link',
            text: 'Twitter 새 비밀번호로 변경 페이지로 바로 이동할 수 있어요!',
            metadata: {
              externalCard: {
                label: 'Twitter 공식',
                title: '새 비밀번호로 변경',
                subtitle: '이전 조합과 겹치지 않는 비밀번호를 사용해요.',
                url: 'https://x.com/settings/password',
                domain: 'x.com/settings/password',
                trustLabel: '공식 페이지',
                ctaLabel: '페이지로 이동',
              },
            },
            createdAt: '2026-07-19T01:00:01.000Z',
          },
        ],
      },
    },
  })
  getChat(@Req() req) {
    return this.securityChatService.getOrCreateChat(req.user.sub);
  }

  @Post('messages')
  @HttpCode(200)
  @UseGuards(PerUserThrottleGuard)
  @ApiOperation({
    summary: '보안 도우미 메시지 전송 — LLM 답변 + rich 메시지 조립',
    description: `2-4 보안 도우미 화면의 입력창 전송 API입니다.

**동작 흐름**
1. 입력값에서 비밀번호/인증코드/카드번호 패턴을 먼저 차단합니다.
2. 최근 대화 히스토리와 사용자의 위험 계정/조치 컨텍스트를 바탕으로 LLM을 호출합니다.
3. LLM은 텍스트 의도만 판단하고, 공식 URL은 백엔드의 service registry / KB에서만 조립합니다.
4. 응답은 \`assistantMessages[]\`로 여러 개 내려올 수 있습니다. 프론트는 배열 순서대로 렌더링하면 됩니다.

**응답에 포함될 수 있는 rich 메시지 타입**
- \`text\`: 일반 텍스트 답변
- \`action_list\`: 조치가 필요한 항목 목록 (metadata.actionList.items)
- \`official_link\`: 공식 페이지 링크 카드 (metadata.externalCard)
- \`card_news\`: 보안 카드뉴스 (metadata.cardNews)
- \`exit_cta\`: 이동 버튼 목록 (metadata.exitCtas)

**성능/UX**
- 실제 LLM 호출이 포함되어 응답까지 수 초가 걸릴 수 있습니다.
- 프론트는 전송 후 로딩 버블을 표시하는 것을 권장합니다.
- 유저별 rate limit이 적용됩니다.`,
  })
  @ApiBody({
    type: SendSecurityChatDto,
    examples: {
      officialLink: {
        summary: '공식 링크 요청',
        value: { message: 'Twitter 비밀번호는 어디서 바꾸면 돼? 공식 링크랑 같이 알려줘' },
      },
      actionList: {
        summary: '해야 할 조치 목록 요청',
        value: { message: '지금 내가 먼저 해야 할 보안 조치 알려줘' },
      },
      offTopic: {
        summary: '보안 외 질문',
        value: { message: '오늘 점심 뭐 먹을까?' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '메시지 처리 결과',
    schema: {
      example: {
        chatId: 'chat-uuid',
        userMessage: {
          id: 'user-message-uuid',
          role: 'user',
          type: 'text',
          text: 'Twitter 비밀번호는 어디서 바꾸면 돼? 공식 링크랑 같이 알려줘',
          createdAt: '2026-07-19T01:00:00.000Z',
        },
        assistantMessages: [
          {
            id: 'assistant-message-uuid',
            role: 'assistant',
            type: 'text',
            text: 'Twitter 비밀번호 변경은 공식 설정 페이지에서 진행할 수 있어요.',
            createdAt: '2026-07-19T01:00:02.000Z',
          },
          {
            id: 'assistant-message-uuid-2',
            role: 'assistant',
            type: 'official_link',
            text: 'Twitter 새 비밀번호로 변경 페이지로 바로 이동할 수 있어요!',
            metadata: {
              externalCard: {
                label: 'Twitter 공식',
                title: '새 비밀번호로 변경',
                subtitle: '이전 조합과 겹치지 않는 비밀번호를 사용해요.',
                url: 'https://x.com/settings/password',
                domain: 'x.com/settings/password',
                trustLabel: '공식 페이지',
                ctaLabel: '페이지로 이동',
              },
            },
            createdAt: '2026-07-19T01:00:02.100Z',
          },
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: '민감정보 입력 또는 유효하지 않은 요청',
    schema: {
      example: {
        message: '비밀번호, 인증코드, 카드번호 같은 보안 정보는 입력하지 마세요. 막힌 상황을 설명해 주세요.',
        error: 'Bad Request',
        statusCode: 400,
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: '유저별 요청 제한 초과',
    schema: {
      example: {
        message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
        statusCode: 429,
      },
    },
  })
  sendMessage(@Req() req, @Body() body: SendSecurityChatDto) {
    return this.securityChatService.sendMessage(req.user.sub, body.message);
  }
}
