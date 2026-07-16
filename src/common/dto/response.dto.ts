import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ServiceAccountSummaryDto {
  @ApiProperty({ example: 'uuid-sa-1' })
  id: string;

  @ApiProperty({ example: 'Disney+' })
  serviceName: string;

  @ApiProperty({ enum: ['high', 'medium', 'low', 'safe'], example: 'high' })
  riskLevel: string;

  @ApiProperty({ enum: ['action_required', 'watch', 'safe', 'resolved', 'dormant'], example: 'action_required' })
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
  notificationAgreed: boolean;

  @ApiProperty({ example: false })
  marketingAgreed: boolean;

  @ApiProperty({ example: '2026-07-01T00:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: [GmailAccountDto] })
  gmailAccounts: GmailAccountDto[];
}
