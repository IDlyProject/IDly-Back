import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RisksService } from './risks.service';
import { RisksController } from './risks.controller';
import { ActionAssistantService } from './assistant/action-assistant.service';
import { JwtAuthModule } from '../auth/jwt.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [JwtAuthModule, HttpModule],
  providers: [RisksService, ActionAssistantService, RateLimitGuard],
  controllers: [RisksController],
  exports: [RisksService],
})
export class RisksModule {}
