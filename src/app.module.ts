import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GmailModule } from './gmail/gmail.module';
import { AnalysisModule } from './analysis/analysis.module';
import { BetaModule } from './beta/beta.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { HomeModule } from './home/home.module';
import { RisksModule } from './risks/risks.module';
import { SummaryModule } from './summary/summary.module';
// 보안 리포트 기능은 현재 비활성화 상태이며, 재사용을 위해 구현 파일은 보존한다.
// import { ReportModule } from './report/report.module';
import { SecurityChatModule } from './security-chat/security-chat.module';
import { GmailSyncModule } from './gmail-sync/gmail-sync.module';
import { FeedbackModule } from './feedback/feedback.module';
import { NotificationModule } from './notification/notification.module';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    GmailModule,
    AnalysisModule,
    BetaModule,
    WaitlistModule,
    HomeModule,
    RisksModule,
    SummaryModule,
    // ReportModule,
    SecurityChatModule,
    GmailSyncModule,
    FeedbackModule,
    NotificationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
