import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  IsEnum,
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

  @ApiPropertyOptional({ description: '닉네임 (마이 화면 프로필 카드 표시용)', example: '민수' })
  @IsString()
  @MaxLength(20)
  @Matches(/^[^<>`]*$/, {
    message: '닉네임에 <, >, ` 문자는 사용할 수 없습니다.',
  })
  @IsOptional()
  nickname?: string;

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

  @ApiPropertyOptional({
    example: true,
    description:
      '필수 약관 2종 통합 동의 (서비스 이용약관·개인정보 처리방침) — 온보딩 시 제공, 반드시 true',
  })
  @IsBoolean()
  @Equals(true)
  @IsOptional()
  requiredTermsAgreed?: true;

  @ApiPropertyOptional({
    example: true,
    description: '실시간 보안 알림 수신 동의 (선택) — 생략 시 기존 값 유지',
  })
  @IsBoolean()
  @IsOptional()
  notificationAgreed?: boolean;

  @ApiPropertyOptional({
    example: false,
    description: '마케팅 정보 수신 동의 (선택) — 생략 시 기존 값 유지',
  })
  @IsBoolean()
  @IsOptional()
  marketingAgreed?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      '온보딩 완료 여부 — 분석 완료 후 홈 화면 최초 진입 시 true로 설정. GET /users/me 응답의 onboardingCompleted가 false이면 앱 진입 시 분석 화면부터 재진행.',
  })
  @IsBoolean()
  @Equals(true)
  @IsOptional()
  onboardingCompleted?: true;
}
