import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '이름', example: '홍길동' })
  @IsString()
  @MaxLength(50)
  /** HTML/스크립트 문자 차단 (저장형 XSS) */
  @Matches(/^[^<>`]*$/, {
    message: '이름에 <, >, ` 문자는 사용할 수 없습니다.',
  })
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: '전화번호', example: '010-1234-5678' })
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9+\-\s()]*$/, {
    message: '전화번호 형식이 올바르지 않습니다.',
  })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description: '연령대',
    example: '20대',
    enum: ['10대', '20대', '30대', '40대', '50대 이상'],
  })
  @IsIn(['10대', '20대', '30대', '40대', '50대 이상'])
  @IsOptional()
  ageGroup?: string;
}
