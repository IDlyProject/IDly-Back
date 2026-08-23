import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { WebPushService } from './web-push.service';

@Module({
  imports: [PrismaModule],
  controllers: [PushController],
  providers: [PushService, WebPushService, RateLimitGuard],
  exports: [PushService],
})
export class PushModule {}
