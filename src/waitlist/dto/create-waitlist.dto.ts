import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateWaitlistDto {
  @ApiProperty({ example: '홍길동' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: '01012341234' })
  @IsString()
  @Matches(/^01[016789]\d{7,8}$/, { message: '올바른 휴대폰 번호를 입력해주세요. (하이픈 없이 입력)' })
  phone: string;

  @ApiProperty({ example: ['abc@gmail.com'], type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsEmail({}, { each: true })
  emails: string[];
}
