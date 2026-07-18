import { Module } from '@nestjs/common';
import { RisksService } from './risks.service';
import { RisksController } from './risks.controller';
import { ActionAssistantService } from './assistant/action-assistant.service';
import { JwtAuthModule } from '../auth/jwt.module';

@Module({
  imports: [JwtAuthModule],
  providers: [RisksService, ActionAssistantService],
  controllers: [RisksController],
  exports: [RisksService],
})
export class RisksModule {}
