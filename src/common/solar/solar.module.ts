import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SolarService } from './solar.service';

@Module({
  imports: [HttpModule],
  providers: [SolarService],
  exports: [SolarService],
})
export class SolarModule {}
