import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceAccountSummaryDto {
  @ApiProperty({ example: 'uuid-sa-1' })
  id: string;

  @ApiProperty({ example: 'Disney+' })
  serviceName: string;

  @ApiProperty({ enum: ['high', 'medium', 'low', 'safe'], example: 'high' })
  riskLevel: string;

  @ApiProperty({
    enum: ['action_required', 'watch', 'safe', 'resolved', 'dormant'],
    example: 'action_required',
    description:
      '계정 관리/프로필 응답에 노출되는 서비스 상태. 과거 skipped 데이터는 프론트 디자인에서 제거되어 응답에서 제외됩니다.',
  })
  status: string;

  @ApiPropertyOptional({ example: '2026-07-17T00:00:00.000Z' })
  lastAnalyzedAt: string | null;
}

export class GmailAccountDto {
  @ApiProperty({ example: 'uuid-gmail-1' })
  id: string;

  @ApiProperty({ example: 'minji.work@gmail.com' })
  email: string;

  @ApiProperty({ example: true })
  isPrimary: boolean;

  @ApiProperty({ enum: ['primary', 'connected'], example: 'primary' })
  role: 'primary' | 'connected';

  @ApiPropertyOptional({ example: null })
  label: string | null;

  @ApiProperty({ example: 'connected' })
  status: string;

  @ApiPropertyOptional({ example: '2026-07-17T00:00:00.000Z' })
  lastSyncedAt: string | null;

  @ApiPropertyOptional({ example: null })
  lastEmailReceivedAt: string | null;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt: string;

  @ApiPropertyOptional({ type: [ServiceAccountSummaryDto] })
  serviceAccounts?: ServiceAccountSummaryDto[];
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

  @ApiProperty({ example: true })
  requiredTermsAgreed: boolean;

  @ApiPropertyOptional({ example: '2026-07-17T00:00:00.000Z' })
  requiredTermsAgreedAt: string | null;

  @ApiProperty({ example: true })
  notificationAgreed: boolean;

  @ApiProperty({ example: false })
  marketingAgreed: boolean;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt: string;

  @ApiPropertyOptional({ example: '2026-07-16T00:00:00.000Z' })
  lastLoginAt: string | null;

  @ApiProperty({ example: 3 })
  dormantAccountCount: number;

  @ApiProperty({
    example: 4,
    description: '연동된 Gmail 계정 총 수 (대표 포함)',
  })
  connectedAccountCount: number;

  @ApiProperty({ type: [GmailAccountDto] })
  gmailAccounts: GmailAccountDto[];
}

export class UserProfileDto {
  @ApiProperty({ example: 'uuid-user-1' })
  id: string;

  @ApiPropertyOptional({ example: '홍길동' })
  name: string | null;

  @ApiPropertyOptional({ example: '010-1234-5678' })
  phone: string | null;

  @ApiPropertyOptional({ example: '20대' })
  ageGroup: string | null;

  @ApiProperty({ example: true })
  requiredTermsAgreed: boolean;

  @ApiPropertyOptional({ example: '2026-07-17T00:00:00.000Z' })
  requiredTermsAgreedAt: string | null;

  @ApiProperty({ example: true })
  notificationAgreed: boolean;

  @ApiProperty({ example: false })
  marketingAgreed: boolean;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt: string;
}
