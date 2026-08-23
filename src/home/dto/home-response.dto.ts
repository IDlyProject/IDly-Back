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

class HomeImmediateActionDto {
  @ApiProperty({ example: 'action-item-id-1', description: 'ActionItem ID' })
  id: string;

  @ApiProperty({
    example: 'service-account-id-1',
    description: '이 조치가 속한 서비스 계정 ID — 계정 상세·조치 채팅 이동에 사용',
  })
  serviceAccountId: string;

  @ApiProperty({
    enum: ['high', 'medium'],
    example: 'high',
    description: '계정 위험도에서 파생. 시트의 점 색상에 사용',
  })
  severity: 'high' | 'medium';

  @ApiProperty({
    example: 'Disney+ 비밀번호 즉시 변경',
    description: '"{서비스명} {조치명}" 형태로 조립되어 내려옵니다',
  })
  title: string;

  @ApiProperty({
    example: '유출된 비밀번호로 계정이 위험합니다',
    nullable: true,
  })
  description: string | null;
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

  @ApiProperty({
    type: [HomeImmediateActionDto],
    description:
      "하단 '즉시 할 일' 시트 목록. 조치 필요 계정의 미완료 필수 조치를 " +
      '위험도 높은 순으로 내려줍니다. 조치할 게 없으면 빈 배열.',
  })
  immediateActions: HomeImmediateActionDto[];
}
