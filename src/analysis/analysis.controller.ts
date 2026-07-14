import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { AnalysisService } from './analysis.service';
import { JwtGuard } from '../auth/jwt.guard';

class StartAnalysisDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mailAccountIds?: string[];
}

@ApiTags('analysis')
@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('start')
  @ApiOperation({ summary: '[화면 07] 분석 시작 — analysisId 즉시 반환, 실제 분석은 백그라운드 실행' })
  @ApiBody({ type: StartAnalysisDto, required: false })
  start(@Req() req, @Body() body: StartAnalysisDto = {}) {
    return this.analysisService.startAnalysis(req.user.sub, body.mailAccountIds);
  }

  @Get(':analysisId/status')
  @ApiOperation({ summary: '[화면 07] 분석 상태 폴링 — completed 수신 시 홈으로 이동' })
  @ApiParam({ name: 'analysisId', description: 'start 응답의 analysisId' })
  getStatus(@Param('analysisId') analysisId: string) {
    return this.analysisService.getStatus(analysisId);
  }
}
