import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { HomeService } from './home.service';
import { JwtGuard } from '../auth/jwt.guard';

@ApiTags('home')
@ApiBearerAuth('access-token')
@UseGuards(JwtGuard)
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  @ApiOperation({ summary: '[화면 홈] 홈 데이터 조회 — 서비스 계정 카드, 보안 점수, 카드뉴스' })
  @ApiQuery({ name: 'mailAccountId', required: false, description: '특정 Gmail 필터 (생략 시 전체)' })
  getHome(@Req() req, @Query('mailAccountId') mailAccountId?: string) {
    return this.homeService.getHome(req.user.sub, mailAccountId ?? 'all');
  }
}
