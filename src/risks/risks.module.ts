import { Module } from '@nestjs/common';
import { RisksService } from './risks.service';
import { RisksController } from './risks.controller';
import { JwtAuthModule } from '../auth/jwt.module';

@Module({
  imports: [JwtAuthModule],
  providers: [RisksService],
  controllers: [RisksController],
  exports: [RisksService],
})
export class RisksModule {}
