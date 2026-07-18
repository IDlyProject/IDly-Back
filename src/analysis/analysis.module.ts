import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { GmailModule } from '../gmail/gmail.module';
import { JwtAuthModule } from '../auth/jwt.module';
import { SolarModule } from '../common/solar/solar.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [HttpModule, GmailModule, JwtAuthModule, SolarModule],
  providers: [AnalysisService, RateLimitGuard],
  controllers: [AnalysisController],
  exports: [AnalysisService],
})
export class AnalysisModule {}
