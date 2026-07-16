import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../auth/jwt.module';
import { GmailService } from './gmail.service';

@Module({
  imports: [JwtAuthModule],
  providers: [GmailService],
  exports: [GmailService],
})
export class GmailModule {}
