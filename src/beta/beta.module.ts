import { Module } from '@nestjs/common';
import { BetaController } from './beta.controller';
import { BetaService } from './beta.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [PrismaModule],
  controllers: [BetaController],
  providers: [BetaService, RateLimitGuard],
})
export class BetaModule {}
