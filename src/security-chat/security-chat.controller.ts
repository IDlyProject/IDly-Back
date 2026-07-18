import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { SecurityChatService } from './security-chat.service';
import { JwtGuard } from '../auth/jwt.guard';
import { RateLimit } from '../common/guards/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

class SendSecurityChatDto {
  @ApiProperty({
    example: 'Twitter 비밀번호는 어디서 바꾸면 돼? 공식 링크랑 같이 알려줘',
    description:
      '보안 도우미에게 보낼 자유 텍스트입니다. 비밀번호, 인증코드, 카드번호 같은 민감정보는 저장/전송 전에 차단됩니다. 최대 1000자.',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  message: string;
}

@ApiBearerAuth('access-token')
@UseGuards(JwtGuard, RateLimitGuard)
@ApiTags('2-4. 보안 도우미')
@Controller('security-chat')
export class SecurityChatController {
  constructor(private readonly securityChatService: SecurityChatService) {}

  @Get()
  @RateLimit({ limit: 60, windowMs: 60_000, key: 'user' })
  @ApiOperation({
    summary: '보안 도우미 채팅 조회 — 2-4 히스토리 복원',
  })
  @ApiResponse({ status: 200, description: '채팅 히스토리' })
  getChat(@Req() req) {
    return this.securityChatService.getOrCreateChat(req.user.sub);
  }

  @Post('messages')
  @HttpCode(200)
  @RateLimit({ limit: 10, windowMs: 60_000, key: 'user' })
  @ApiOperation({
    summary: '보안 도우미 메시지 전송 — LLM 답변 + rich 메시지 조립',
    description: '유저당 분당 10회 제한. 민감정보 패턴 차단.',
  })
  @ApiBody({ type: SendSecurityChatDto })
  @ApiResponse({ status: 200, description: '메시지 처리 결과' })
  @ApiResponse({ status: 400, description: '민감정보 입력 또는 유효하지 않은 요청' })
  @ApiResponse({ status: 429, description: '유저별 요청 제한 초과' })
  sendMessage(@Req() req, @Body() body: SendSecurityChatDto) {
    return this.securityChatService.sendMessage(req.user.sub, body.message);
  }
}
