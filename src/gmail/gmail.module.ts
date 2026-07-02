import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../auth/jwt.module';
import { GmailController } from './gmail.controller';
import { GmailService } from './gmail.service';

@Module({
  imports: [JwtAuthModule],
  controllers: [GmailController],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}
