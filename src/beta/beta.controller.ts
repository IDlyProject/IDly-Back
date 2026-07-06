import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BetaService } from './beta.service';
import { CreateBetaApplicantDto } from './dto/create-beta-applicant.dto';

@ApiTags('onboarding')
@Controller('beta')
export class BetaController {
  constructor(private readonly betaService: BetaService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: '[랜딩] 베타 테스터 신청',
    description: '이메일·전화번호를 저장합니다. 동일 이메일 중복 신청 시 409 반환.',
  })
  apply(@Body() dto: CreateBetaApplicantDto) {
    return this.betaService.apply(dto);
  }
}
