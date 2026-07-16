import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '이름', example: '홍길동' })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: '전화번호', example: '010-1234-5678' })
  @IsString()
  @MaxLength(20)
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
