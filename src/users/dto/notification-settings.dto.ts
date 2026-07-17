import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @ApiPropertyOptional({ description: '의심 로그인 감지', example: true })
  @IsBoolean()
  @IsOptional()
  alertSuspiciousLogin?: boolean;

  @ApiPropertyOptional({ description: '비밀번호 변경 알림', example: true })
  @IsBoolean()
  @IsOptional()
  alertPasswordChange?: boolean;

  @ApiPropertyOptional({ description: '새 기기 로그인', example: true })
  @IsBoolean()
  @IsOptional()
  alertNewDevice?: boolean;

  @ApiPropertyOptional({ description: '복구 이메일 변경', example: true })
  @IsBoolean()
  @IsOptional()
  alertRecoveryEmail?: boolean;

  @ApiPropertyOptional({ description: '보안 팁 알림 (마케팅)', example: false })
  @IsBoolean()
  @IsOptional()
  alertSecurityTip?: boolean;

  @ApiPropertyOptional({ description: '이벤트 알림 (마케팅)', example: false })
  @IsBoolean()
  @IsOptional()
  alertEventPromo?: boolean;
}
