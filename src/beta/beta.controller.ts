import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BetaService } from './beta.service';
import { CreateBetaApplicantDto } from './dto/create-beta-applicant.dto';

@ApiTags('랜딩 | 베타 신청')
@Controller('beta')
export class BetaController {
  constructor(private readonly betaService: BetaService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: '베타 테스터 신청',
    description: '이메일·전화번호를 저장합니다. 동일 이메일 중복 신청 시 409 반환.',
  })
  @ApiResponse({ status: 201, description: '신청 완료' })
  @ApiResponse({ status: 409, description: '이미 신청된 이메일' })
  apply(@Body() dto: CreateBetaApplicantDto) {
    return this.betaService.apply(dto);
  }
}
