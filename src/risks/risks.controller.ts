import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { RisksService } from './risks.service';
import { ActionAssistantService } from './assistant/action-assistant.service';
import { JwtGuard } from '../auth/jwt.guard';

class CreateSessionDto {
  @ApiProperty({
    required: false,
    default: true,
    description:
      'true면 세션 생성 직후 첫 번째 필수 pending 조치를 자동 선택하고, dynamic 화면의 초기 말풍선/공식 링크/피드백 버튼까지 함께 생성합니다.',
  })
  @IsBoolean()
  @IsOptional()
  bootstrapFirstAction?: boolean;
}

class SendMessageDto {
  @ApiProperty({
    example: 'session-uuid',
    description: 'POST /action-session 또는 GET /action-session에서 받은 보안도우미 세션 ID',
  })
  @IsString()
  sessionId: string;

  @ApiProperty({
    enum: ['action_select', 'feedback', 'failure_reason'],
    description:
      'dynamic 화면 이벤트 타입. action_select는 조치 카드 선택, feedback은 완료/실패 버튼, failure_reason은 실패 사유 입력입니다.',
  })
  @IsIn(['action_select', 'feedback', 'failure_reason'])
  type: 'action_select' | 'feedback' | 'failure_reason';

  @ApiProperty({
    required: false,
    description: 'type=action_select일 때 필수. 선택한 recommendedActions/actionItems의 id.',
  })
  @IsString()
  @IsOptional()
  actionItemId?: string;

  @ApiProperty({
    required: false,
    maxLength: 500,
    description:
      'type=failure_reason일 때 필수. 막힌 상황 설명입니다. 비밀번호/인증코드/카드번호 같은 민감정보는 입력하면 안 됩니다.',
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  message?: string;

  @ApiProperty({
    enum: ['completed', 'failed'],
    required: false,
    description:
      'type=feedback일 때 필수. completed는 현재 activeActionItem을 완료 처리, failed는 실패 사유 입력창을 엽니다.',
  })
  @IsIn(['completed', 'failed'])
  @IsOptional()
  feedbackValue?: 'completed' | 'failed';

  @ApiProperty({
    required: false,
    example: 'cannot_find_page',
    description:
      'type=failure_reason일 때 선택. 예: cannot_find_page, login_failed, not_my_account, do_later, other',
  })
  @IsString()
  @IsOptional()
  reasonCategory?: string;
}

@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('service-accounts')
export class RisksController {
  constructor(
    private readonly risksService: RisksService,
    private readonly actionAssistantService: ActionAssistantService,
  ) {}

  // ── 계정 상세 ─────────────────────────────────────────────────────────────────

  @Get(':serviceAccountId')
  @ApiTags('2-3. 계정 상세 · 보안 조치')
  @ApiOperation({
    summary: '서비스 계정 상세 — 위험 근거 + 조치 가이드',
    description: `2-3 계정 상세 첫 화면에 필요한 보안 상태/근거/조치 목록을 반환합니다.

**화면 매칭**
- 상단 서비스 정보: \`displayName\`, \`riskBadgeText\`, \`sourceMailAccount\`
- 위험 카드: \`headline\`, \`summary\`, \`interpretation\`
- 최근 이벤트: \`recentEvents[]\`
- 추천 조치/CTA: \`actionItems[]\`, \`primaryCta\`
- 카드뉴스 스트립: \`cardNews\`
- 이미 진행 중인 조치 대화: \`activeSessionId\`

**응답 포함 항목**
- \`status\`, \`riskLevel\`, \`headline\`, \`summary\`, \`interpretation\`
- \`recentEvents[]\`: 위험 판단 근거 이메일 목록 (최근 5건)
- \`actionItems[]\`: KB/AI 결과 기반 조치 항목 (type, title, subtitle, why, status 포함)
- \`primaryCta\`: 첫 번째 필수 pending 조치 (CTA 버튼용)
- \`activeSessionId\`: 현재 활성 보안도우미 세션 ID (없으면 null)
- \`actionGuide\`: 하위 호환 유지 (구 API)`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({
    status: 200,
    description: '서비스 계정 상세 정보',
    schema: {
      example: {
        id: 'service-account-uuid',
        serviceName: 'Twitter',
        displayName: 'Twitter',
        riskBadgeText: '보안 위험',
        sourceMailAccount: {
          id: 'gmail-account-uuid',
          email: 'user@gmail.com',
          label: 'Gmail동',
        },
        status: 'action_required',
        riskLevel: 'high',
        headline: '새로운 기기에서 로그인되었습니다',
        summary: '다른 사이트와 같은 비밀번호를 쓰고 있을 가능성이 있어요.',
        interpretation: '비밀번호 변경과 2단계 인증 설정을 먼저 권장합니다.',
        activeSessionId: null,
        primaryCta: {
          actionItemId: 'action-item-uuid',
          label: '비밀번호 변경하기',
          officialUrl: 'https://x.com/settings/password',
        },
        recentEvents: [
          {
            id: 'evidence-uuid',
            sender: 'security@x.com',
            receivedAt: '2026-07-19T01:00:00.000Z',
            subject: '새로운 로그인 알림',
            summary: '새 기기 접근 알림',
            riskType: 'new_device_login',
          },
        ],
        actionItems: [
          {
            id: 'action-item-uuid',
            type: 'change_password',
            title: '비밀번호 변경하기',
            subtitle: '이전 조합과 겹치지 않는 비밀번호를 사용해요.',
            required: true,
            isRequired: true,
            externalUrl: 'https://x.com/settings/password',
            status: 'pending',
            order: 0,
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: '서비스를 찾을 수 없음' })
  getDetail(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.getServiceDetail(id, req.user.sub);
  }

  // ── 건너뛰기 ──────────────────────────────────────────────────────────────────

  @Patch(':serviceAccountId/skip')
  @Post(':serviceAccountId/skip')
  @HttpCode(200)
  @ApiTags('2-3. 계정 상세 · 보안 조치')
  @ApiOperation({ summary: '조치 건너뛰기 — skipped 처리' })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({ status: 200, schema: { example: { serviceAccountId: 'uuid', status: 'skipped' } } })
  skipAccount(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.skipAccount(id, req.user.sub);
  }

  // ── 숨기기 / 복원 ─────────────────────────────────────────────────────────────

  @Patch(':serviceAccountId/dormant')
  @Post(':serviceAccountId/dormant')
  @HttpCode(200)
  @ApiTags('2-1. 홈 화면')
  @ApiOperation({
    summary: '계정 숨기기 — 홈에서 숨기고 휴면 계정으로 전환',
    description: `서비스 계정을 휴면 상태(\`dormant\`)로 전환합니다.`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({ status: 200, schema: { example: { serviceAccountId: 'sa-uuid', status: 'dormant' } } })
  @ApiResponse({ status: 404, description: '서비스를 찾을 수 없음' })
  setDormant(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.setDormant(id, req.user.sub);
  }

  @Patch(':serviceAccountId/restore')
  @HttpCode(200)
  @ApiTags('4-1. 마이 화면')
  @ApiOperation({ summary: '휴면 계정 복원 — 휴면 해제 후 이전 상태로 복원' })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({ status: 200, schema: { example: { serviceAccountId: 'sa-uuid', status: 'safe' } } })
  @ApiResponse({ status: 404, description: '서비스를 찾을 수 없음' })
  restoreDormant(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.restoreDormant(id, req.user.sub);
  }

  // ── 보안 도우미 세션 ──────────────────────────────────────────────────────────

  @Get(':serviceAccountId/action-session')
  @ApiTags('2-3. 계정 상세 · 보안 조치')
  @ApiOperation({
    summary: '현재 보안도우미 세션 조회',
    description: `2-3 "지금 바로 조치하기" 화면 진입 전에 호출합니다.

**반환 정책**
- active 세션이 있으면 현재 대화 상태를 반환합니다.
- completed 세션은 실제 필수 조치가 모두 done인 경우에만 readOnly 완료 화면으로 반환합니다.
- 현재 계정에 pending/failed 필수 조치가 있으면 과거 completed 세션은 stale로 보고 반환하지 않습니다.
- 세션이 없으면 \`null\`을 반환합니다.

**프론트 처리**
- \`null\`: POST /action-session으로 새 세션 생성
- \`readOnly=false\`: 기존 진행 중 대화 복원
- \`readOnly=true\`: 완료 응답/종료 CTA 화면 표시`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({
    status: 200,
    description:
      '세션 정보 반환. 아직 세션이 없거나 완료 후 미결 필수 조치가 남은 경우 `null` 반환 — 클라이언트는 null 체크 후 POST /action-session으로 세션을 생성하세요.',
    schema: {
      example: {
        sessionId: 'session-uuid',
        serviceAccountId: 'service-account-uuid',
        sessionStatus: 'active',
        readOnly: false,
        activeActionItemId: 'action-item-uuid',
        feedbackEnabled: true,
        composerEnabled: false,
        composerPlaceholder: '메시지를 입력하세요',
        title: '지금 바로 조치하기',
        botProfile: { name: '보안 도우미', avatarKey: 'owl' },
        progress: { doneCount: 0, totalRequired: 2, label: '0/2 완료' },
        riskIntroCard: {
          severity: 'high',
          title: '보안 위험 감지',
          description: '새로운 기기에서 로그인이 감지되었어요.',
        },
        recommendedActions: [
          {
            id: 'action-item-uuid',
            type: 'change_password',
            title: '비밀번호 변경하기',
            subtitle: '이전 조합과 겹치지 않는 비밀번호를 사용해요.',
            status: 'pending',
            required: true,
            selectable: true,
            externalCard: {
              label: 'Twitter 공식',
              title: '비밀번호 변경하기',
              url: 'https://x.com/settings/password',
              domain: 'x.com/settings/password',
              trustLabel: '공식 페이지',
              ctaLabel: '페이지로 이동',
            },
          },
        ],
        messages: [
          { id: 'message-uuid', role: 'assistant', type: 'risk_intro', text: '보안 위험 감지' },
          { id: 'message-uuid-2', role: 'assistant', type: 'action_list', text: '추천 조치 사항' },
          { id: 'message-uuid-3', role: 'user', type: 'user_chip', text: '비밀번호 변경하기' },
          { id: 'message-uuid-4', role: 'assistant', type: 'official_link', text: '비밀번호 변경하기 페이지로 바로 이동할 수 있어요!' },
          { id: 'message-uuid-5', role: 'assistant', type: 'feedback_actions', text: '' },
        ],
        completion: null,
      },
    },
  })
  getSession(@Req() req, @Param('serviceAccountId') id: string) {
    return this.actionAssistantService.getSession(id, req.user.sub);
  }

  @Post(':serviceAccountId/action-session')
  @HttpCode(200)
  @ApiTags('2-3. 계정 상세 · 보안 조치')
  @ApiOperation({
    summary: '보안도우미 세션 생성 (또는 기존 세션 반환)',
    description: `active 세션이 있으면 idempotent하게 반환합니다.
\`bootstrapFirstAction=true\`(기본값) 시 첫 번째 필수 pending 조치를 자동으로 선택해서 초기 메시지를 생성합니다.

**dynamic 화면 초기 메시지**
1. \`risk_intro\`: 위험 카드
2. \`action_list\`: 추천 조치 목록
3. \`user_chip\`: 자동 선택된 첫 조치
4. \`official_link\`: 공식 페이지 카드
5. \`card_news\` 또는 \`tip\`: 보안 팁
6. \`feedback_actions\`: "조치를 완료했어요" / "조치하지 못했어요" 버튼`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiBody({
    type: CreateSessionDto,
    required: false,
    examples: {
      bootstrap: {
        summary: '첫 조치를 자동 선택',
        value: { bootstrapFirstAction: true },
      },
      noBootstrap: {
        summary: '조치 목록까지만 표시',
        value: { bootstrapFirstAction: false },
      },
    },
  })
  @ApiResponse({ status: 200, description: '세션 생성 또는 기존 세션 반환' })
  createSession(
    @Req() req,
    @Param('serviceAccountId') id: string,
    @Body() body: CreateSessionDto,
  ) {
    return this.actionAssistantService.createSession(
      id,
      req.user.sub,
      body?.bootstrapFirstAction ?? true,
    );
  }

  @Post(':serviceAccountId/action-session/messages')
  @HttpCode(200)
  @ApiTags('2-3. 계정 상세 · 보안 조치')
  @ApiOperation({
    summary: '보안도우미 메시지 전송',
    description: `2-3 "지금 바로 조치하기" 화면의 버튼/입력 이벤트를 처리합니다.

**type 종류와 화면 상태 전이**
- \`action_select\`: 사용자가 추천 조치 항목을 선택합니다. \`actionItemId\` 필수. 응답으로 \`official_link\`, \`tip/card_news\`, \`feedback_actions\`가 내려옵니다.
- \`feedback\` + \`completed\`: 현재 \`activeActionItemId\`를 완료 처리합니다. 남은 필수 조치가 있으면 \`action_list\`, 모두 끝나면 \`celebration\` + \`exit_cta\`가 내려옵니다.
- \`feedback\` + \`failed\`: 완료하지 못한 상태로 전환하고 \`composerEnabled=true\`, \`composerPlaceholder\`를 내려 입력창을 엽니다.
- \`failure_reason\`: 실패 사유를 저장하고 같은 조치의 도움말/공식 링크/피드백 버튼을 다시 내려줍니다.

**주의**
- \`user_text\`는 2-3 action assistant에서 지원하지 않습니다. 실패 사유는 \`failure_reason\`을 사용합니다.
- 비밀번호/인증코드/카드번호 같은 민감정보는 \`failure_reason.message\`에 넣으면 안 됩니다.`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiBody({
    type: SendMessageDto,
    examples: {
      selectAction: {
        summary: '조치 선택',
        value: {
          sessionId: 'session-uuid',
          type: 'action_select',
          actionItemId: 'action-item-uuid',
        },
      },
      completed: {
        summary: '조치 완료',
        value: {
          sessionId: 'session-uuid',
          type: 'feedback',
          feedbackValue: 'completed',
        },
      },
      failed: {
        summary: '조치 실패 버튼',
        value: {
          sessionId: 'session-uuid',
          type: 'feedback',
          feedbackValue: 'failed',
        },
      },
      failureReason: {
        summary: '실패 사유 입력',
        value: {
          sessionId: 'session-uuid',
          type: 'failure_reason',
          message: '비밀번호 변경 페이지를 찾지 못했어요.',
          reasonCategory: 'cannot_find_page',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: '메시지 처리 결과',
    schema: {
      example: {
        sessionId: 'session-uuid',
        activeActionItemId: 'action-item-uuid',
        feedbackEnabled: true,
        composerEnabled: false,
        composerPlaceholder: null,
        sessionStatus: 'active',
        readOnly: false,
        progress: { doneCount: 1, totalRequired: 2, label: '1/2 완료' },
        userMessage: {
          id: 'message-uuid',
          role: 'user',
          type: 'user_chip',
          text: '조치를 완료했어요 !',
          createdAt: '2026-07-19T01:00:00.000Z',
        },
        assistantMessages: [
          {
            id: 'assistant-message-uuid',
            role: 'assistant',
            type: 'text',
            text: '완료! 1/2 완료 이제 마지막 하나만 남았어요.',
            createdAt: '2026-07-19T01:00:00.100Z',
          },
          {
            id: 'assistant-message-uuid-2',
            role: 'assistant',
            type: 'action_list',
            text: '남은 조치 사항',
            metadata: {
              actionList: {
                title: '남은 조치 사항',
                actionIds: ['next-action-item-uuid'],
              },
            },
            createdAt: '2026-07-19T01:00:00.200Z',
          },
        ],
        recommendedActions: [],
        completion: null,
      },
    },
  })
  sendMessage(
    @Req() req,
    @Param('serviceAccountId') id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.actionAssistantService.sendMessage(id, req.user.sub, body);
  }
}
