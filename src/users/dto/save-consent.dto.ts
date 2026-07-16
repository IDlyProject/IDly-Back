import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsOptional } from 'class-validator';

export class SaveConsentDto {
  @ApiProperty({
    example: true,
    description:
      '필수 약관 3종 통합 동의 (서비스 이용약관·개인정보 처리방침·위치기반 서비스 이용약관)',
  })
  @IsBoolean()
  @Equals(true)
  requiredTermsAgreed: true;

  @ApiPropertyOptional({
    example: true,
    description: '실시간 보안 알림 수신 동의 (선택) — 생략 시 기존 값 유지',
  })
  @IsOptional()
  @IsBoolean()
  notificationAgreed?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: '마케팅 정보 수신 동의 (선택) — 생략 시 기존 값 유지',
  })
  @IsOptional()
  @IsBoolean()
  marketingAgreed?: boolean;
}
