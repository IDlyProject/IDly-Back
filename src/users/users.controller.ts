import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtGuard } from '../auth/jwt.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SaveConsentDto } from './dto/save-consent.dto';
import { GmailAccountDto, UserDto } from '../common/dto/response.dto';

@ApiTags('4-1. 마이 화면')
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
마이 화면에서 프로필 수정 시에도 동일 API를 사용합니다.`,
  })
  @ApiResponse({ status: 200, type: UserDto, description: '수정된 유저 프로필' })
  async updateProfile(@Req() req, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.sub, body);
  }

  @Post('me/consent')
  @ApiTags('1-2. 회원가입')
  @ApiOperation({
    summary: '서비스 이용 동의 저장',
    description: `온보딩 약관 동의 화면의 선택 항목을 저장합니다.

- 필수 약관(서비스이용약관·개인정보처리방침·위치기반)은 이 API 호출 자체가 동의 처리
- \`notificationAgreed\`: 실시간 보안 알림 수신 동의 (선택) — 미동의 시 알림 발송 안 됨
- \`marketingAgreed\`: 마케팅 정보 수신 동의 (선택)`,
  })
  @ApiResponse({ status: 201, description: '동의 저장됨', schema: { example: { id: 'user-uuid', notificationAgreed: true, marketingAgreed: false } } })
  async saveConsent(@Req() req, @Body() body: SaveConsentDto) {
    return this.usersService.saveConsent(req.user.sub, body);
  }

  @Get('me')
  @ApiOperation({
    summary: '내 프로필 조회',
    description: `로그인한 유저의 프로필과 연결된 Gmail 계정 목록을 반환합니다.

**응답 포함 정보**
- \`id\`, \`name\`, \`phone\`, \`ageGroup\`, \`notificationAgreed\`
- \`gmailAccounts[]\`: 각 계정의 \`email\`, \`isPrimary\`, \`lastSyncedAt\`, 연결된 서비스 목록`,
  })
  @ApiResponse({ status: 200, type: UserDto, description: '유저 프로필 + Gmail 계정 목록' })
  async getMe(@Req() req) {
    return this.usersService.findById(req.user.sub);
  }

  @Get('me/accounts')
  @ApiTags('1-2. 회원가입')
  @ApiTags('4-2. 계정 관리')
  @ApiOperation({
    summary: '연결된 Gmail 계정 목록',
    description: `연결된 Gmail 계정 목록을 반환합니다.

온보딩 추가 계정 연동 화면과 마이 화면 계정 관리 두 곳에서 사용됩니다.

**응답 포함 정보**
- \`email\`, \`isPrimary\` (대표 계정 여부), \`lastSyncedAt\`
- \`serviceAccounts[]\`: 각 서비스의 \`serviceName\`, \`riskLevel\`, \`status\`

대표 계정이 먼저, 이후 연결 순서대로 정렬됩니다.`,
  })
  @ApiResponse({ status: 200, type: [GmailAccountDto], description: 'Gmail 계정 목록 (serviceAccounts 포함)' })
  async getAccounts(@Req() req) {
    return this.usersService.getConnectedAccounts(req.user.sub);
  }
}
