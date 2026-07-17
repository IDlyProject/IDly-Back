import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export enum DeleteReason {
  NOT_FREQUENT = 'not_frequent',   // 자주 이용하지 않아요
  FREQUENT_ERRORS = 'frequent_errors', // 오류가 자주 발생해요
  INCONVENIENT = 'inconvenient',   // 기능이 편리하지 않아요
  OTHER = 'other',                 // 기타
}

export class DeleteAccountDto {
  @ApiProperty({
    enum: DeleteReason,
    enumName: 'DeleteReason',
    description: `탈퇴 사유\n- not_frequent: 자주 이용하지 않아요\n- frequent_errors: 오류가 자주 발생해요\n- inconvenient: 기능이 편리하지 않아요\n- other: 기타 (reasonDetail 필수)`,
    example: DeleteReason.OTHER,
  })
  @IsEnum(DeleteReason)
  reason: DeleteReason;

  @ApiPropertyOptional({
    description: '기타 사유 직접 입력 — reason=other 일 때 필수, 최대 500자',
    example: '개인정보 보호를 위해',
    maxLength: 500,
  })
  @ValidateIf((o) => o.reason === DeleteReason.OTHER)
  @IsNotEmpty({ message: '기타 사유를 입력해 주세요.' })
  @IsString()
  @MaxLength(500)
  reasonDetail?: string;
}
