import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBetaApplicantDto {
  @ApiProperty({ example: 'test@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: '010-1234-5678' })
  @IsString()
  @MinLength(9)
  @MaxLength(20)
  @Matches(/^[0-9+\-\s()]+$/)
  phone: string;
}
