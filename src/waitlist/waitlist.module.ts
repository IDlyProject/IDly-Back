import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminWaitlistController, WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { PushModule } from '../push/push.module';

@Module({
  imports: [PushModule, PrismaModule],
  controllers: [WaitlistController, AdminWaitlistController],
  providers: [WaitlistService],
})
export class WaitlistModule {}
