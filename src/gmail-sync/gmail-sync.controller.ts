import {
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { GmailSyncQueueService } from './gmail-sync-queue.service';

@UseGuards(JwtGuard)
@Controller('gmail-sync')
export class GmailSyncController {
  constructor(private readonly queue: GmailSyncQueueService) {}

  @Post('accounts/:accountId/refresh')
  @HttpCode(202)
  async refresh(@Req() req, @Param('accountId') accountId: string) {
    const result = await this.queue.enqueueManual(req.user.sub, accountId);
    return {
      syncJobId: result.job.id,
      status: result.job.status,
      deduplicated: result.deduplicated,
      cooldownMs: 30_000,
    };
  }
}
