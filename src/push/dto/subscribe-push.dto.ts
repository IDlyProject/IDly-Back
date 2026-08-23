import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class PushKeysDto {
  @ApiProperty({ description: '브라우저가 발급한 공개키' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  p256dh: string;

  @ApiProperty({ description: '브라우저가 발급한 인증 시크릿' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  auth: string;
}

export class SubscribePushDto {
  @ApiProperty({
    example: '홍길동',
    description: '사전등록 시 입력한 이름 — 전화번호와 함께 대조한다',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: '01012341234', description: '사전등록 시 입력한 전화번호' })
  @IsString()
  @Matches(/^01[016789]\d{7,8}$/, {
    message: '올바른 휴대폰 번호를 입력해주세요. (하이픈 없이 입력)',
  })
  phone: string;

  @ApiProperty({
    description: 'pushManager.subscribe()가 돌려준 endpoint',
    example: 'https://fcm.googleapis.com/fcm/send/...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}
