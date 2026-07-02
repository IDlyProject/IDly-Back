import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AnalysisService } from './analysis.service';
import { AnalysisController } from './analysis.controller';
import { GmailModule } from '../gmail/gmail.module';
import { JwtAuthModule } from '../auth/jwt.module';

@Module({
  imports: [HttpModule, GmailModule, JwtAuthModule],
  providers: [AnalysisService],
  controllers: [AnalysisController],
  exports: [AnalysisService],
})
export class AnalysisModule {}
