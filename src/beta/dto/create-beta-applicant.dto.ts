import { ApiProperty } from '@nestjs/swagger';

export class CreateBetaApplicantDto {
  @ApiProperty({ example: 'test@example.com' })
  email: string;

  @ApiProperty({ example: '010-1234-5678' })
  phone: string;
}
