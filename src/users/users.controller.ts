import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtGuard } from '../auth/jwt.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GmailAccountDto, UserDto } from '../common/dto/response.dto';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @ApiTags('onboarding')
  @ApiOperation({
    summary: '[화면 03] 이름 입력 — 프로필 저장',
    description: `
**화면 03 · 대표 계정 확인 + 이름 입력**

OAuth 콜백 직후 이름을 입력받아 저장합니다.
\`name\` 만 보내도 되고, 나중에 마이 화면에서 \`phone\`, \`ageGroup\` 추가 수정도 이 API 사용합니다.

변경할 필드만 보내면 됩니다 (partial update).
    `.trim(),
  })
  @ApiResponse({ status: 200, type: UserDto, description: '수정된 유저 프로필' })
  async updateProfile(@Req() req, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.sub, body);
  }

  @Get('me')
  @ApiOperation({
    summary: '[마이] 내 프로필 조회',
    description: `
로그인한 유저의 프로필과 연결된 Gmail 계정 목록을 반환합니다.

**응답 포함 정보**
- \`id\`, \`name\`, \`phone\`, \`ageGroup\`
- \`gmailAccounts[]\`: 각 계정의 \`email\`, \`isPrimary\`, \`lastSyncedAt\`, 연결된 서비스 목록
    `.trim(),
  })
  @ApiResponse({ status: 200, type: UserDto, description: '유저 프로필 + Gmail 계정 목록' })
  async getMe(@Req() req) {
    return this.usersService.findById(req.user.sub);
  }

  @Get('me/accounts')
  @ApiOperation({
    summary: '[마이] 연결된 Gmail 계정 목록',
    description: `
마이 화면에서 연결된 Gmail 계정 목록을 보여줄 때 사용합니다.

**응답 포함 정보**
- \`email\`, \`isPrimary\` (대표 계정 여부), \`lastSyncedAt\` (마지막 동기화)
- \`serviceAccounts[]\`: 각 서비스의 \`serviceName\`, \`riskStatus\` (\`safe\` / \`warning\` / \`danger\`), \`lastAnalyzedAt\`

대표 계정이 먼저, 이후 연결 순서대로 정렬됩니다.
    `.trim(),
  })
  @ApiResponse({ status: 200, type: [GmailAccountDto], description: 'Gmail 계정 목록 (serviceAccounts 포함)' })
  async getAccounts(@Req() req) {
    return this.usersService.getConnectedAccounts(req.user.sub);
  }
}
