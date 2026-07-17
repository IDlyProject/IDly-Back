import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum DeleteReason {
  NOT_FREQUENT = 'not_frequent',
  FREQUENT_ERRORS = 'frequent_errors',
  INCONVENIENT = 'inconvenient',
  OTHER = 'other',
}

export class DeleteAccountDto {
  @ApiProperty({
    enum: DeleteReason,
    description: '탈퇴 사유 선택',
    example: DeleteReason.OTHER,
  })
  @IsEnum(DeleteReason)
  reason: DeleteReason;

  @ApiPropertyOptional({
    description: '기타 사유 직접 입력 (reason=other 일 때만 유효)',
    example: '개인정보 보호를 위해',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonDetail?: string;
}
