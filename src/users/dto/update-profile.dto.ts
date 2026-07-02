import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: '이름', example: '홍길동' })
  name?: string;

  @ApiPropertyOptional({ description: '전화번호', example: '010-1234-5678' })
  phone?: string;

  @ApiPropertyOptional({
    description: '연령대',
    example: '20대',
    enum: ['10대', '20대', '30대', '40대', '50대 이상'],
  })
  ageGroup?: string;
}
