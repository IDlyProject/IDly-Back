import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
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
import {
  GmailAccountDto,
  UserDto,
  UserProfileDto,
} from '../common/dto/response.dto';

@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @ApiTags('1-2. 회원가입')
  @ApiOperation({
    summary: '대표 계정 설정 — 이름·전화번호·연령대 저장',
    description: `온보딩 첫 화면(대표 계정 설정)에서 이름·전화번호·연령대를 저장합니다.

변경할 필드만 보내면 됩니다 (partial update).
마이 화면(4-1)에서 프로필 수정 시에도 동일 API를 사용합니다.`,
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
    summary: '서비스 이용 동의 저장',
    description: `온보딩 약관 동의 화면의 필수 약관 통합 동의와 선택 항목을 저장합니다.

- \`requiredTermsAgreed\`: 필수 약관 3종 통합 동의 — 반드시 \`true\`
- \`requiredTermsAgreedAt\`: 최초 필수 약관 동의 시각으로 자동 저장
- \`notificationAgreed\`: 실시간 보안 알림 수신 동의 (선택) — 생략 시 기존 값 유지
- \`marketingAgreed\`: 마케팅 정보 수신 동의 (선택) — 생략 시 기존 값 유지`,
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

온보딩 대표 계정 확인(1-2)과 마이 화면(4-1)에서 함께 사용됩니다.

**응답 포함 정보**
- \`id\`, \`name\`, \`phone\`, \`ageGroup\`, \`requiredTermsAgreed\`, \`requiredTermsAgreedAt\`, \`notificationAgreed\`, \`marketingAgreed\`
- \`gmailAccounts[]\`: 각 계정의 \`email\`, \`isPrimary\`, \`role\`, \`lastSyncedAt\`, 연결된 서비스 목록`,
  })
  @ApiResponse({
    status: 200,
    type: UserDto,
    description: '유저 프로필 + Gmail 계정 목록',
  })
  async getMe(@Req() req) {
    return this.usersService.findById(req.user.sub);
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
