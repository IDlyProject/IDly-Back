import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SaveConsentDto {
  @ApiProperty({ example: true, description: '실시간 보안 알림 수신 동의 (선택)' })
  @IsBoolean()
  notificationAgreed: boolean;

  @ApiProperty({ example: false, description: '마케팅 정보 수신 동의 (선택)' })
  @IsBoolean()
  marketingAgreed: boolean;
}
