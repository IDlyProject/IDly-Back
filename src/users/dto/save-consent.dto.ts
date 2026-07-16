import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class SaveConsentDto {
  @ApiPropertyOptional({ example: true, description: '실시간 보안 알림 수신 동의 (선택) — 생략 시 false' })
  @IsOptional()
  @IsBoolean()
  notificationAgreed?: boolean;

  @ApiPropertyOptional({ example: false, description: '마케팅 정보 수신 동의 (선택) — 생략 시 false' })
  @IsOptional()
  @IsBoolean()
  marketingAgreed?: boolean;
}
