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
  @ApiProperty({ required: false, default: true })
  @IsBoolean()
  @IsOptional()
  bootstrapFirstAction?: boolean;
}

class SendMessageDto {
  @ApiProperty({ example: 'session-uuid' })
  @IsString()
  sessionId: string;

  @ApiProperty({ enum: ['action_select', 'user_text', 'feedback', 'failure_reason'] })
  @IsEnum(['action_select', 'user_text', 'feedback', 'failure_reason'])
  type: 'action_select' | 'user_text' | 'feedback' | 'failure_reason';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  actionItemId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  message?: string;

  @ApiProperty({ enum: ['completed', 'failed'], required: false })
  @IsIn(['completed', 'failed'])
  @IsOptional()
  feedbackValue?: 'completed' | 'failed';

  @ApiProperty({ required: false, example: 'cannot_find_page' })
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
    description: `서비스 계정의 상세 보안 정보를 반환합니다.

**응답 포함 항목**
- \`status\`, \`riskLevel\`, \`headline\`, \`summary\`, \`interpretation\`
- \`recentEvents[]\`: 위험 판단 근거 이메일 목록 (최근 5건)
- \`actionItems[]\`: KB 기반 조치 항목 (type, why, subtitle 포함)
- \`primaryCta\`: 첫 번째 필수 pending 조치 (CTA 버튼용)
- \`activeSessionId\`: 현재 활성 보안도우미 세션 ID (없으면 null)
- \`actionGuide\`: 하위 호환 유지 (구 API)`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({ status: 200, description: '서비스 계정 상세 정보' })
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
    description: `active/completed 세션이 있으면 반환, 없으면 null 반환.`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({ status: 200, description: '세션 정보 또는 null' })
  getSession(@Req() req, @Param('serviceAccountId') id: string) {
    return this.actionAssistantService.getSession(id, req.user.sub);
  }

  @Post(':serviceAccountId/action-session')
  @HttpCode(200)
  @ApiTags('2-3. 계정 상세 · 보안 조치')
  @ApiOperation({
    summary: '보안도우미 세션 생성 (또는 기존 세션 반환)',
    description: `active 세션이 있으면 idempotent하게 반환합니다.
\`bootstrapFirstAction=true\`(기본값) 시 첫 번째 필수 pending 조치를 자동으로 선택해서 초기 메시지를 생성합니다.`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiBody({ type: CreateSessionDto, required: false })
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
    description: `**type 종류**
- \`action_select\`: 조치 항목 선택 (actionItemId 필수)
- \`user_text\`: 자유 텍스트 입력 (message 필수)
- \`feedback\`: 조치 완료/실패 피드백 (feedbackValue 필수: \`completed\` | \`failed\`)
- \`failure_reason\`: 실패 사유 입력 (message 필수, reasonCategory 선택)`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiBody({ type: SendMessageDto })
  @ApiResponse({ status: 200, description: '메시지 처리 결과' })
  sendMessage(
    @Req() req,
    @Param('serviceAccountId') id: string,
    @Body() body: SendMessageDto,
  ) {
    return this.actionAssistantService.sendMessage(id, req.user.sub, body);
  }
}
