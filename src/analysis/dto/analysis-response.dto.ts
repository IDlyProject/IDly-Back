import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalysisTargetMailAccountDto {
  @ApiProperty({ example: 'gmail-account-id-1' })
  id: string;

  @ApiProperty({ example: 'minji@gmail.com' })
  email: string;

  @ApiProperty({ enum: ['primary', 'connected'], example: 'primary' })
  role: 'primary' | 'connected';
}

export class StartAnalysisResponseDto {
  @ApiProperty({ example: 'analysis-run-id-1' })
  analysisId: string;

  @ApiProperty({ enum: ['queued', 'scanning'], example: 'queued' })
  status: 'queued' | 'scanning';

  @ApiProperty({ type: [AnalysisTargetMailAccountDto] })
  targetMailAccounts: AnalysisTargetMailAccountDto[];

  @ApiProperty({ example: '분석을 준비하고 있어요.' })
  message: string;
}

export class AnalysisStatusResponseDto {
  @ApiProperty({ example: 'analysis-run-id-1' })
  analysisId: string;

  @ApiProperty({
    enum: ['queued', 'scanning', 'completed', 'failed'],
    example: 'scanning',
  })
  status: 'queued' | 'scanning' | 'completed' | 'failed';

  @ApiProperty({ minimum: 0, maximum: 100, example: 70 })
  progress: number;

  @ApiProperty({
    enum: [
      'waiting',
      'checking_connected_mail',
      'collecting_account_signals',
      'preparing_home',
      'completed',
      'failed',
    ],
    example: 'preparing_home',
  })
  currentStep: string;

  @ApiProperty({ example: '홈 화면을 준비하고 있어요.' })
  displayMessage: string;

  @ApiPropertyOptional({ example: '2026-07-17T00:00:00.000Z', nullable: true })
  completedAt: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  errorMessage: string | null;
}
