import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class ApproveWaitlistDto {
  @ApiProperty({ example: '01012341234' })
  @IsString()
  @Matches(/^01[016789]\d{7,8}$/, { message: '올바른 휴대폰 번호를 입력해주세요.' })
  phone: string;
}
