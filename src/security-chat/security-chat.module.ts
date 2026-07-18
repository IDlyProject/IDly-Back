import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SecurityChatService } from './security-chat.service';
import { SecurityChatController } from './security-chat.controller';
import { JwtAuthModule } from '../auth/jwt.module';
import { PerUserThrottleGuard } from '../common/guards/per-user-throttle.guard';

@Module({
  imports: [JwtAuthModule, HttpModule],
  providers: [SecurityChatService, PerUserThrottleGuard],
  controllers: [SecurityChatController],
})
export class SecurityChatModule {}
