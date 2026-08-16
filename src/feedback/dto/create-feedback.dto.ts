import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateFeedbackDto {
  @ApiProperty({ example: '홈 화면에서 분석 완료 후 카드가 업데이트 안 됩니다.', description: '제보 내용' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  message: string;

  @ApiPropertyOptional({ example: '/home', description: '현재 화면 경로' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  screenPath?: string;
}
