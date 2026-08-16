import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SolapiService } from './solapi.service';
import { AdminWaitlistController, WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

@Module({
  imports: [PrismaModule],
  controllers: [WaitlistController, AdminWaitlistController],
  providers: [WaitlistService, SolapiService],
})
export class WaitlistModule {}
