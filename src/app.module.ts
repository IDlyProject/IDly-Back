import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GmailModule } from './gmail/gmail.module';
import { AnalysisModule } from './analysis/analysis.module';
import { BetaModule } from './beta/beta.module';
import { HomeModule } from './home/home.module';
import { RisksModule } from './risks/risks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    GmailModule,
    AnalysisModule,
    BetaModule,
    HomeModule,
    RisksModule,
  ],
})
export class AppModule {}
