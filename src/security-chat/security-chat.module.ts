import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SecurityChatService } from './security-chat.service';
import { SecurityChatController } from './security-chat.controller';
import { JwtAuthModule } from '../auth/jwt.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [JwtAuthModule, HttpModule],
  providers: [SecurityChatService, RateLimitGuard],
  controllers: [SecurityChatController],
})
export class SecurityChatModule {}
