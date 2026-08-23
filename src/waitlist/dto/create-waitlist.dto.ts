import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
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

  @ApiProperty({
    example: true,
    description: '(필수) 만 14세 이상입니다 — 사전등록 화면 체크박스',
  })
  @IsBoolean()
  @Equals(true, { message: '만 14세 이상 동의가 필요합니다.' })
  ageOver14Agreed: boolean;

  @ApiProperty({
    example: true,
    description: '(필수) 개인정보 수집·이용 동의 — 사전등록 화면 체크박스',
  })
  @IsBoolean()
  @Equals(true, { message: '개인정보 수집·이용 동의가 필요합니다.' })
  privacyAgreed: boolean;
}
