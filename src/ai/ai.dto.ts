import { ApiProperty } from '@nestjs/swagger';

export class AiSignalDto {
  @ApiProperty({ description: 'Gmail 메시지 ID' })
  messageId: string;

  @ApiProperty({ description: '메일 제목' })
  subject: string;

  @ApiProperty({ description: '발신자' })
  from: string;

  @ApiProperty({ description: '수신 날짜 (ISO 8601)' })
  date: string;

  @ApiProperty({ description: '메일 내용 요약' })
  snippet: string;
}

export class AiActionDto {
  @ApiProperty({ description: '액션 라벨', example: '비밀번호 변경' })
  label: string;

  @ApiProperty({ description: '필수 여부' })
  isRequired: boolean;
}

export class AiServiceResultDto {
  @ApiProperty({ description: '서비스 이름', example: 'Disney+' })
  name: string;

  @ApiProperty({ description: '위험 상태', enum: ['safe', 'warning', 'danger'] })
  riskStatus: string;

  @ApiProperty({
    description: '위험 유형',
    example: 'new_device_login',
    nullable: true,
  })
  riskType: string | null;

  @ApiProperty({ description: '심각도', enum: ['low', 'medium', 'high'], nullable: true })
  severity: string | null;

  @ApiProperty({ description: '근거 메일 목록', type: [AiSignalDto] })
  signals: AiSignalDto[];

  @ApiProperty({ description: '권장 액션 목록', type: [AiActionDto] })
  actions: AiActionDto[];
}

export class AiAnalyzeResponseDto {
  @ApiProperty({ description: '분석된 서비스 목록', type: [AiServiceResultDto] })
  services: AiServiceResultDto[];
}
