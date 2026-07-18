import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SecurityChatService } from './security-chat.service';
import { SecurityChatController } from './security-chat.controller';
import { JwtAuthModule } from '../auth/jwt.module';

@Module({
  imports: [JwtAuthModule, HttpModule],
  providers: [SecurityChatService],
  controllers: [SecurityChatController],
})
export class SecurityChatModule {}
