import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { RisksService } from './risks.service';
import { JwtGuard } from '../auth/jwt.guard';

class UpdateActionStatusDto {
  @IsEnum(['resolved', 'skipped', 'pending'])
  status: 'resolved' | 'skipped' | 'pending';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  completedStepIds?: string[];
}

@ApiTags('service-accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('service-accounts')
export class RisksController {
  constructor(private readonly risksService: RisksService) {}

  @Get(':serviceAccountId')
  @ApiOperation({ summary: '[화면 상세] 서비스 계정 상세 — 위험 근거 + 조치 가이드' })
  @ApiParam({ name: 'serviceAccountId' })
  getDetail(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.getServiceDetail(id, req.user.sub);
  }

  @Post(':serviceAccountId/action-status')
  @ApiOperation({ summary: '[화면 상세] 조치 상태 저장 — resolved/skipped/pending' })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiBody({ type: UpdateActionStatusDto })
  updateStatus(@Req() req, @Param('serviceAccountId') id: string, @Body() body: UpdateActionStatusDto) {
    return this.risksService.updateActionStatus(id, req.user.sub, body);
  }
}
