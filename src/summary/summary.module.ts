import { Module } from '@nestjs/common';
import { SummaryService } from './summary.service';
import { SummaryController } from './summary.controller';
import { JwtAuthModule } from '../auth/jwt.module';

@Module({
  imports: [JwtAuthModule],
  providers: [SummaryService],
  controllers: [SummaryController],
})
export class SummaryModule {}
