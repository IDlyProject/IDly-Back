import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtGuard } from '../auth/jwt.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SaveConsentDto } from './dto/save-consent.dto';
import { UpdateNotificationSettingsDto } from './dto/notification-settings.dto';
import {
  GmailAccountDto,
  UserDto,
  UserProfileDto,
} from './dto/user-response.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @ApiTags('1-2. 회원가입')
  @ApiOperation({
    summary: '프로필 저장 — 이름·전화번호·연령대 및 약관 동의 저장',
    description: `온보딩(프로필 설정 + 약관 동의)과 마이 화면(4-1) 프로필 수정에 모두 사용합니다.

변경할 필드만 보내면 됩니다 (partial update).

**온보딩 시**: \`requiredTermsAgreed: true\`를 함께 전송하면 약관 동의가 함께 저장됩니다.
- \`requiredTermsAgreedAt\`은 최초 동의 시각으로만 기록되며 이후 변경되지 않습니다.
- \`notificationAgreed\`, \`marketingAgreed\`는 선택 동의로, 생략 시 기존 값을 유지합니다.

**닉네임**: \`nickname\` 필드로 전달하세요. 마이 화면 프로필 카드에 표시됩니다. null이면 \`name\`으로 대체해주세요.

**온보딩 완료 마킹**: 분석 완료 후 홈 화면 최초 진입 시 \`{ onboardingCompleted: true }\`를 전송하세요. 이후 앱 재진입 시 \`GET /users/me\`의 \`onboardingCompleted\` 값으로 분석 화면 스킵 여부를 결정합니다.

**마이 화면 프로필 수정 시**: 프로필 필드만 전송하면 됩니다.`,
  })
  @ApiResponse({
    status: 200,
    type: UserProfileDto,
    description: '수정된 유저 기본 프로필',
  })
  async updateProfile(@Req() req, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.sub, body);
  }

  @Post('me/consent')
  @ApiTags('1-2. 회원가입')
  @ApiOperation({
    deprecated: true,
    summary: '[deprecated] 서비스 이용 동의 저장 — PATCH /users/me 사용 권장',
    description: `**이 엔드포인트는 더 이상 사용하지 않습니다.**\n\n약관 동의 저장 기능이 \`PATCH /users/me\`에 통합되었습니다. \`requiredTermsAgreed\`, \`notificationAgreed\`, \`marketingAgreed\` 필드를 \`PATCH /users/me\` 요청에 포함하세요.`,
  })
  @ApiResponse({
    status: 201,
    description: '동의 저장됨',
    schema: {
      example: {
        id: 'user-uuid',
        requiredTermsAgreed: true,
        requiredTermsAgreedAt: '2026-07-17T00:00:00.000Z',
        notificationAgreed: true,
        marketingAgreed: false,
      },
    },
  })
  async saveConsent(@Req() req, @Body() body: SaveConsentDto) {
    return this.usersService.saveConsent(req.user.sub, body);
  }

  @Get('me')
  @ApiTags('1-2. 회원가입')
  @ApiOperation({
    summary: '내 프로필 조회',
    description: `로그인한 유저의 프로필과 연결된 Gmail 계정 목록을 반환합니다.

온보딩 대표 계정 확인(1-2), 마이 화면(4-1), 계정 관리(4-2)에서 함께 사용됩니다.

**응답 포함 정보**
- \`id\`, \`name\`, \`nickname\`, \`phone\`, \`ageGroup\`, \`requiredTermsAgreed\`, \`requiredTermsAgreedAt\`, \`notificationAgreed\`, \`marketingAgreed\`
- \`onboardingCompleted\`: 온보딩 완료 여부 — **앱 진입 시 이 값이 false이면 분석 화면(1-3, 6-1-Analy)부터 재진행해야 합니다.** 분석 완료 후 홈 화면 최초 진입 시 \`PATCH /users/me { onboardingCompleted: true }\`로 설정하세요.
- \`createdAt\`: 가입일 (계정 관리 화면 계정 정보 섹션)
- \`lastLoginAt\`: 마지막 로그인 일시 (계정 관리 화면 계정 정보 섹션)
- \`connectedAccountCount\`: 연동된 Gmail 계정 총 수 (대표 포함, 계정 관리 화면 계정 정보 섹션)
- \`dormantAccountCount\`: 마이 화면의 숨긴 계정 수
- \`gmailAccounts[]\`: 각 계정의 \`email\`, \`isPrimary\`, \`role\`, \`lastSyncedAt\`, 연결된 서비스 목록`,
  })
  @ApiResponse({
    status: 200,
    type: UserDto,
    description: '유저 프로필 + Gmail 계정 목록',
  })
  async getMe(@Req() req) {
    const user = await this.usersService.findById(req.user.sub);
    if (!user) throw new NotFoundException('유저를 찾을 수 없습니다.');
    return user;
  }

  @Get('me/dormant-accounts')
  @ApiTags('4-1. 마이 화면')
  @ApiOperation({
    summary: '휴면 계정 목록',
    description: `현재 사용자의 휴면(\`dormant\`) 상태 서비스 계정 목록을 반환합니다.

**응답 포함 정보**
- \`id\`, \`serviceName\`, \`displayName\`, \`iconUrl\`, \`iconLabel\`
- \`email\`: 해당 서비스가 연결된 Gmail 계정 이메일
- \`dormantAt\`: 휴면 전환 일시 (ISO 8601)
- \`dormantDuration\`: 휴면 기간 (예: "3개월", "1년")`,
  })
  @ApiResponse({
    status: 200,
    description: '휴면 계정 목록',
    schema: {
      example: [
        {
          id: 'sa-uuid',
          serviceName: 'Tumblr',
          displayName: 'Tumblr',
          iconUrl: null,
          iconLabel: 'T',
          email: 'minsu@gmail.com',
          dormantAt: '2026-04-17T00:00:00.000Z',
          dormantDuration: '3개월',
        },
      ],
    },
  })
  async getDormantAccounts(@Req() req) {
    return this.usersService.getDormantAccounts(req.user.sub);
  }

  @Patch('me/dormant-accounts/restore-all')
  @HttpCode(200)
  @ApiTags('4-1. 마이 화면')
  @ApiOperation({
    summary: '휴면 계정 전체 복원',
    description: '현재 사용자의 모든 휴면 계정을 이전 상태로 복원합니다.',
  })
  @ApiResponse({
    status: 200,
    description: '전체 복원 완료',
    schema: { example: { restoredCount: 3 } },
  })
  async restoreAllDormant(@Req() req) {
    return this.usersService.restoreAllDormant(req.user.sub);
  }

  @Get('me/notification-settings')
  @ApiTags('4-1. 마이 화면')
  @ApiOperation({
    summary: '알림 설정 조회',
    description: `보안 알림 4종과 마케팅 알림 2종의 현재 설정값을 반환합니다.

**정책**
- 보안 알림은 개별 보안 토글 4종이 실제 발송 기준입니다.
- \`notificationAgreed\`는 온보딩 최초 수신 동의 기록으로 유지합니다.
- 마케팅 알림 발송은 \`marketingAgreed === true\` 이면서 해당 개별 마케팅 토글이 \`true\`일 때만 가능합니다.
- 개별 마케팅 토글을 \`true\`로 변경하면 \`marketingAgreed\`도 자동으로 \`true\`로 승격됩니다.

**보안 알림**
- \`alertSuspiciousLogin\`: 의심 로그인 감지
- \`alertPasswordChange\`: 비밀번호 변경 알림
- \`alertNewDevice\`: 새 기기 로그인
- \`alertRecoveryEmail\`: 복구 이메일 변경

**마케팅**
- \`alertSecurityTip\`: 보안 팁 알림
- \`alertEventPromo\`: 이벤트 알림`,
  })
  @ApiResponse({
    status: 200,
    description: '알림 설정',
    schema: {
      example: {
        alertSuspiciousLogin: true,
        alertPasswordChange: true,
        alertNewDevice: true,
        alertRecoveryEmail: true,
        alertSecurityTip: false,
        alertEventPromo: false,
      },
    },
  })
  async getNotificationSettings(@Req() req) {
    return this.usersService.getNotificationSettings(req.user.sub);
  }

  @Patch('me/notification-settings')
  @ApiTags('4-1. 마이 화면')
  @ApiOperation({
    summary: '알림 설정 변경',
    description: `변경할 항목만 포함해서 보내면 됩니다 (partial update).

보안 알림은 개별 보안 토글이 실제 발송 기준입니다.
마케팅 알림은 \`marketingAgreed\` 상위 동의가 필요하며, \`alertSecurityTip\` 또는 \`alertEventPromo\`를 \`true\`로 변경하면 \`marketingAgreed\`도 자동으로 \`true\`가 됩니다.`,
  })
  @ApiResponse({
    status: 200,
    description: '변경된 알림 설정',
    schema: {
      example: {
        alertSuspiciousLogin: true,
        alertPasswordChange: true,
        alertNewDevice: true,
        alertRecoveryEmail: true,
        alertSecurityTip: false,
        alertEventPromo: false,
      },
    },
  })
  async updateNotificationSettings(
    @Req() req,
    @Body() body: UpdateNotificationSettingsDto,
  ) {
    return this.usersService.updateNotificationSettings(req.user.sub, body);
  }

  @Delete('me')
  @HttpCode(200)
  @ApiTags('4-3. 탈퇴')
  @ApiOperation({
    summary: '회원 탈퇴',
    description: `회원 계정과 연결된 Gmail/서비스 이용 기록을 즉시 영구 삭제합니다.

탈퇴 사유는 사용자 식별 정보 없이 \`WithdrawalLog\`에 별도 저장합니다.

**탈퇴 사유 선택지 (4-3-2 화면)**
- \`not_frequent\`: 자주 이용하지 않아요
- \`frequent_errors\`: 오류가 자주 발생해요
- \`inconvenient\`: 기능이 편리하지 않아요
- \`other\`: 기타 — \`reasonDetail\` 필수`,
  })
  @ApiResponse({
    status: 200,
    description: '회원 탈퇴 완료',
    schema: {
      example: {
        deleted: true,
      },
    },
  })
  async deleteMe(@Req() req, @Res({ passthrough: true }) res, @Body() body: DeleteAccountDto) {
    const result = await this.usersService.deleteAccount(req.user.sub, body);
    const isProd = process.env.NODE_ENV === 'production';
    const base = { httpOnly: true, secure: isProd, sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax' };
    res.clearCookie('idly_token', base);
    res.clearCookie('idly_refresh', { ...base, path: '/api/auth' });
    return result;
  }

  @Delete('me/accounts/:accountId')
  @HttpCode(200)
  @ApiTags('4-2. 계정 관리')
  @ApiOperation({
    summary: '연동 Gmail 계정 해제',
    description: `연동된 Gmail 계정을 해제합니다.

- 대표 계정(isPrimary=true)은 해제할 수 없습니다 → 400
- 본인 소유가 아닌 계정이면 → 404
- 해제 시 해당 Gmail로 분석된 서비스 계정 데이터도 함께 삭제됩니다 (Cascade)`,
  })
  @ApiResponse({
    status: 200,
    description: '연동 해제 완료',
    schema: {
      example: {
        disconnectedAccountId: 'gmail-uuid',
        connectedAccountCount: 2,
      },
    },
  })
  async disconnectAccount(@Req() req, @Param('accountId') accountId: string) {
    return this.usersService.disconnectAccount(req.user.sub, accountId);
  }

  @Get('me/accounts')
  @ApiTags('1-2. 회원가입')
  @ApiOperation({
    summary: '연결된 Gmail 계정 목록',
    description: `연결된 Gmail 계정 목록을 반환합니다.

온보딩 추가 계정 연동 화면(1-2-5)과 계정 관리(4-2) 두 곳에서 사용됩니다.

**응답 포함 정보**
- \`email\`, \`isPrimary\` (대표 계정 여부), \`role\` (\`primary\` / \`connected\`), \`lastSyncedAt\`
- \`serviceAccounts[]\`: 각 서비스의 \`serviceName\`, \`riskLevel\`, \`status\`

대표 계정이 먼저, 이후 연결 순서대로 정렬됩니다.`,
  })
  @ApiResponse({
    status: 200,
    type: [GmailAccountDto],
    description: 'Gmail 계정 목록 (serviceAccounts 포함)',
  })
  async getAccounts(@Req() req) {
    return this.usersService.getConnectedAccounts(req.user.sub);
  }
}
