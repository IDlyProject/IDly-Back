import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActionItemDto {
  @ApiProperty({ example: 'uuid-action-1' })
  id: string;

  @ApiProperty({ example: 'uuid-risk-event-1' })
  riskEventId: string;

  /** 조치 내용 */
  @ApiProperty({ example: '비밀번호 변경' })
  label: string;

  /** 필수 여부 — true: 필수 배지(빨강), false: 권장 배지(회색) */
  @ApiProperty({ example: true })
  isRequired: boolean;

  /** 조치 상태 */
  @ApiProperty({ enum: ['pending', 'done', 'skipped'], example: 'pending' })
  status: string;

  @ApiProperty({ example: '2026-07-02T12:00:00.000Z' })
  createdAt: string;
}

export class RiskEventDto {
  @ApiProperty({ example: 'uuid-risk-event-1' })
  id: string;

  @ApiProperty({ example: 'uuid-service-account-1' })
  serviceAccountId: string;

  /** 위험 유형 */
  @ApiProperty({
    enum: ['new_device_login', 'password_reset', 'auth_code', 'account_recovery', 'permission_grant', 'security_notice'],
    example: 'new_device_login',
  })
  riskType: string;

  /** 심각도 */
  @ApiProperty({ enum: ['low', 'medium', 'high'], example: 'high' })
  severity: string;

  /** 처리 상태 */
  @ApiProperty({ enum: ['pending', 'resolved', 'skipped'], example: 'pending' })
  status: string;

  /** 근거 메일 목록 (감지된 신호) */
  @ApiProperty({
    type: 'array',
    example: [{ messageId: 'abc123', subject: '새 기기에서 로그인', from: 'noreply@disney.com', date: '2026-07-01' }],
  })
  evidenceEmails: any[];

  @ApiProperty({ example: '2026-07-02T12:00:00.000Z' })
  createdAt: string;

  @ApiPropertyOptional({ example: null })
  resolvedAt: string | null;

  @ApiProperty({ type: [ActionItemDto] })
  actionItems: ActionItemDto[];
}

export class ServiceAccountDto {
  @ApiProperty({ example: 'uuid-service-account-1' })
  id: string;

  @ApiProperty({ example: 'uuid-gmail-account-1' })
  gmailAccountId: string;

  /** 서비스 이름 */
  @ApiProperty({ example: 'Disney+' })
  serviceName: string;

  /** 위험 상태 */
  @ApiProperty({ enum: ['safe', 'warning', 'danger'], example: 'danger' })
  riskStatus: string;

  @ApiPropertyOptional({ example: '2026-07-02T12:00:00.000Z' })
  lastAnalyzedAt: string | null;

  @ApiProperty({ example: '2026-07-02T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: [RiskEventDto] })
  riskEvents: RiskEventDto[];

  @ApiPropertyOptional({ example: { email: 'minji.work@gmail.com' } })
  gmailAccount?: { email: string };
}

export class GmailAccountDto {
  @ApiProperty({ example: 'uuid-gmail-account-1' })
  id: string;

  @ApiProperty({ example: 'minji.work@gmail.com' })
  email: string;

  /** 대표 계정 여부 */
  @ApiProperty({ example: true })
  isPrimary: boolean;

  @ApiPropertyOptional({ example: '2026-07-02T12:00:00.000Z' })
  lastSyncedAt: string | null;

  @ApiProperty({ example: '2026-07-02T12:00:00.000Z' })
  createdAt: string;

  @ApiPropertyOptional({ type: [ServiceAccountDto] })
  serviceAccounts?: ServiceAccountDto[];
}

export class UserDto {
  @ApiProperty({ example: 'uuid-user-1' })
  id: string;

  @ApiPropertyOptional({ example: '홍길동' })
  name: string | null;

  @ApiPropertyOptional({ example: '010-1234-5678' })
  phone: string | null;

  @ApiPropertyOptional({ example: '20대' })
  ageGroup: string | null;

  @ApiProperty({ example: '2026-07-02T12:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: [GmailAccountDto] })
  gmailAccounts: GmailAccountDto[];
}

export class AnalysisRunDto {
  /** 분석 실행 ID — 상태 폴링에 사용 */
  @ApiProperty({ example: 'uuid-run-1' })
  runId: string;
}

export class AnalysisRunStatusDto {
  @ApiProperty({ example: 'uuid-run-1' })
  id: string;

  @ApiProperty({ example: 'uuid-user-1' })
  userId: string;

  /** 분석 상태 — completed 수신 시 홈(화면 08)으로 이동 */
  @ApiProperty({ enum: ['queued', 'scanning', 'completed', 'failed'], example: 'scanning' })
  status: string;

  @ApiProperty({ example: '2026-07-02T12:00:00.000Z' })
  startedAt: string;

  @ApiPropertyOptional({ example: null })
  completedAt: string | null;
}
