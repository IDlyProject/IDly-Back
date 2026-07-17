import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { RisksService } from './risks.service';
import { JwtGuard } from '../auth/jwt.guard';

class UpdateActionStatusDto {
  @ApiProperty({
    enum: ['resolved', 'skipped', 'pending'],
    example: 'resolved',
  })
  @IsEnum(['resolved', 'skipped', 'pending'])
  status: 'resolved' | 'skipped' | 'pending';

  @ApiProperty({
    example: ['action-item-id-1', 'action-item-id-2'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  completedStepIds?: string[];
}

@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('service-accounts')
export class RisksController {
  constructor(private readonly risksService: RisksService) {}

  @Get(':serviceAccountId')
  @ApiTags('2-3. 계정 상세 · 보안 조치')
  @ApiOperation({
    summary: '서비스 계정 상세 — 위험 근거 + 조치 가이드',
    description: `서비스 계정의 상세 보안 정보를 반환합니다.

**응답 포함 항목**
- \`status\`, \`riskLevel\`, \`headline\`, \`summary\`, \`interpretation\`
- \`evidences[]\`: 위험 판단 근거 이메일 목록
- \`actionGuide\`: 조치 가이드 및 단계별 체크리스트

\`evidenceHash\` 기준으로 동일 근거는 중복 저장하지 않으며, 메일 본문은 저장하지 않습니다.`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({ status: 200, description: '서비스 계정 상세 정보' })
  @ApiResponse({ status: 404, description: '서비스를 찾을 수 없음' })
  getDetail(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.getServiceDetail(id, req.user.sub);
  }

  @Patch(':serviceAccountId/action-status')
  @Post(':serviceAccountId/action-status') // 하위 호환
  @HttpCode(200)
  @ApiTags('2-3. 계정 상세 · 보안 조치')
  @ApiOperation({
    summary: '조치 상태 저장 — resolved / skipped / pending',
    description: `보안 조치 결과를 저장합니다. (\`PATCH\` 권장, \`POST\` 하위 호환)

- \`resolved\`: 조치 완료 — 계정 상태가 \`resolved\`로 변경됨
- \`skipped\`: 건너뜀 — 계정 상태가 \`skipped\`로 변경되고 홈 조치 대상에서 제외됨
- \`pending\`: 미완료 상태로 되돌림 — 위험도에 따라 \`action_required\` 또는 \`watch\`로 복원
- \`completedStepIds\`: 완료한 체크리스트 항목 ID 배열 (선택)`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiBody({ type: UpdateActionStatusDto })
  @ApiResponse({
    status: 200,
    description: '조치 상태 저장됨',
    schema: {
      example: {
        serviceAccountId: 'sa-uuid',
        status: 'resolved',
        resolvedAt: '2026-07-17T00:00:00.000Z',
        homeDelta: { actionRequiredCount: 2, securityScore: 78 },
      },
    },
  })
  @ApiResponse({ status: 404, description: '서비스를 찾을 수 없음' })
  updateStatus(
    @Req() req,
    @Param('serviceAccountId') id: string,
    @Body() body: UpdateActionStatusDto,
  ) {
    return this.risksService.updateActionStatus(id, req.user.sub, body);
  }

  @Patch(':serviceAccountId/dormant')
  @Post(':serviceAccountId/dormant') // 하위 호환
  @HttpCode(200)
  @ApiTags('2-1. 홈 화면')
  @ApiOperation({
    summary: '계정 숨기기 — 홈에서 숨기고 휴면 계정으로 전환',
    description: `서비스 계정을 휴면 상태(\`dormant\`)로 전환합니다. (\`PATCH\` 권장, \`POST\` 하위 호환)

휴면 계정은 홈 카드 목록에서 제외되며, 보안 점수 계산에서도 빠집니다.
전환 시 기존 status가 \`previousStatus\`에 저장되어 복원 시 사용됩니다.`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({
    status: 200,
    description: '휴면 전환 완료',
    schema: { example: { serviceAccountId: 'sa-uuid', status: 'dormant' } },
  })
  @ApiResponse({ status: 404, description: '서비스를 찾을 수 없음' })
  setDormant(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.setDormant(id, req.user.sub);
  }

  @Patch(':serviceAccountId/restore')
  @HttpCode(200)
  @ApiTags('4-1. 마이 화면')
  @ApiOperation({
    summary: '휴면 계정 복원 — 휴면 해제 후 이전 상태로 복원',
    description: `휴면(\`dormant\`) 상태의 서비스 계정을 휴면 전 상태로 복원합니다.

복원된 계정은 홈 카드 목록에 다시 표시되고 보안 점수 계산에 포함됩니다.`,
  })
  @ApiParam({ name: 'serviceAccountId' })
  @ApiResponse({
    status: 200,
    description: '복원 완료',
    schema: { example: { serviceAccountId: 'sa-uuid', status: 'safe' } },
  })
  @ApiResponse({ status: 404, description: '서비스를 찾을 수 없음' })
  restoreDormant(@Req() req, @Param('serviceAccountId') id: string) {
    return this.risksService.restoreDormant(id, req.user.sub);
  }
}
