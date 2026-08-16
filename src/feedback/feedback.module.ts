import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtAuthModule } from '../auth/jwt.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

@Module({
  imports: [HttpModule, JwtAuthModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, RateLimitGuard],
})
export class FeedbackModule {}
