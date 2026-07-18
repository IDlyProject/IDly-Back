import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { JwtAuthModule } from './jwt.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [JwtAuthModule, UsersModule, PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, RateLimitGuard],
  exports: [AuthService],
})
export class AuthModule {}
