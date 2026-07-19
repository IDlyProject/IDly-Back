import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class BackgroundAnalysisDto {
  @ApiProperty({ enum: ['idle', 'scanning', 'failed'], example: 'scanning' })
  status: 'idle' | 'scanning' | 'failed';

  @ApiPropertyOptional({ example: 'analysis-run-id-1', nullable: true })
  analysisId: string | null;
}

class HomeMailAccountDto {
  @ApiProperty({ example: 'gmail-account-id-1' })
  id: string;

  @ApiProperty({ example: 'minji@gmail.com' })
  email: string;

  @ApiProperty({ example: 'Gmail동' })
  label: string;

  @ApiProperty({ enum: ['primary', 'connected'], example: 'primary' })
  role: 'primary' | 'connected';

  @ApiProperty({ example: 'connected' })
  status: string;

  @ApiProperty({ example: 12 })
  serviceAccountCount: number;
}

class HomeMetricsDto {
  @ApiProperty({ example: 12 })
  totalServiceAccounts: number;

  @ApiProperty({ example: 2 })
  actionRequiredCount: number;

  @ApiProperty({ minimum: 0, maximum: 100, example: 78 })
  securityScore: number;
}

class HomeRiskSummaryDto {
  @ApiProperty({ enum: ['has_risk', 'safe'], example: 'has_risk' })
  state: 'has_risk' | 'safe';

  @ApiProperty({ example: '가장 먼저 Disney+ 확인' })
  title: string;

  @ApiProperty({ example: '새 기기 로그인 · 위험도 높음' })
  subtitle: string;

  @ApiPropertyOptional({ example: 'service-account-id-1', nullable: true })
  serviceAccountId: string | null;
}

class HomeServiceAccountDto {
  @ApiProperty({ example: 'service-account-id-1' })
  id: string;

  @ApiProperty({ example: 'gmail-account-id-1' })
  sourceMailAccountId: string;

  @ApiProperty({
    example: {
      id: 'gmail-account-id-1',
      email: 'minji@gmail.com',
      label: 'Gmail동',
      role: 'primary',
    },
  })
  sourceMailAccount: {
    id: string;
    email: string;
    label: string;
    role: 'primary' | 'connected';
  };

  @ApiProperty({ example: 'disney' })
  serviceName: string;

  @ApiProperty({ example: 'Disney+' })
  displayName: string;

  @ApiPropertyOptional({
    example: 'https://example.com/icon.png',
    nullable: true,
  })
  iconUrl: string | null;

  @ApiProperty({ example: 'D' })
  iconLabel: string;

  @ApiProperty({ enum: ['high', 'medium', 'low', 'safe'], example: 'high' })
  riskLevel: string;

  @ApiProperty({
    enum: ['action_required', 'watch', 'safe', 'resolved'],
    example: 'action_required',
  })
  status: string;

  @ApiPropertyOptional({ example: 'new_device_login', nullable: true })
  primaryRiskType: string | null;

  @ApiProperty({ example: 3 })
  evidenceCount: number;
}

class CardNewsDto {
  @ApiProperty({ example: 'cn_001' })
  id: string;

  @ApiProperty({ example: '🏠' })
  emoji: string;

  @ApiProperty({ example: '불 꺼진 창문, 그냥 두면 위험한 이유' })
  title: string;

  @ApiProperty({ example: 'https://www.instagram.com/idly__apt/' })
  url: string;
}

export class HomeResponseDto {
  @ApiPropertyOptional({ example: 'analysis-run-id-1', nullable: true })
  analysisId: string | null;

  @ApiPropertyOptional({ example: '민지', nullable: true })
  userName: string | null;

  @ApiProperty({ example: 'all' })
  selectedMailAccountId: string;

  @ApiPropertyOptional({ example: '2026-07-17T00:00:00.000Z', nullable: true })
  lastAnalyzedAt: string | null;

  @ApiProperty({ type: BackgroundAnalysisDto })
  backgroundAnalysis: BackgroundAnalysisDto;

  @ApiProperty({ type: [HomeMailAccountDto] })
  mailAccounts: HomeMailAccountDto[];

  @ApiProperty({ type: HomeMetricsDto })
  metrics: HomeMetricsDto;

  @ApiProperty({ type: HomeRiskSummaryDto })
  riskSummary: HomeRiskSummaryDto;

  @ApiProperty({ type: [HomeServiceAccountDto] })
  serviceAccounts: HomeServiceAccountDto[];

  @ApiProperty({ type: [CardNewsDto] })
  cardNews: CardNewsDto[];
}
