import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AlimtalkService } from './alimtalk.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [PrismaModule],
  providers: [AlimtalkService, NotificationService, NotificationSchedulerService],
  exports: [NotificationService, AlimtalkService],
})
export class NotificationModule {}
