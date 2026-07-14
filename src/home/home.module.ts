import { Module } from '@nestjs/common';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthModule } from '../auth/jwt.module';

@Module({
  imports: [PrismaModule, JwtAuthModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
