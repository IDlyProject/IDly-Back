import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../auth/jwt.module';
import { GmailModule } from '../gmail/gmail.module';
import { AnalysisModule } from '../analysis/analysis.module';
import { GmailPushController } from './gmail-push.controller';
import { GmailPushInboxService } from './gmail-push-inbox.service';
import { GmailPushOidcGuard } from './gmail-push-oidc.guard';
import { GmailPushOidcService } from './gmail-push-oidc.service';
import { GmailSyncController } from './gmail-sync.controller';
import { GmailSyncQueueService } from './gmail-sync-queue.service';
import { GmailApiAdapter } from './gmail-api.adapter';
import { GmailWatchService } from './gmail-watch.service';
import { GmailSyncSchedulerService } from './gmail-sync-scheduler.service';
import { GmailSyncWorkerService } from './gmail-sync-worker.service';
import { GmailIncrementalProcessorService } from './gmail-incremental-processor.service';
import { GMAIL_INCREMENTAL_PROCESSOR } from './gmail-incremental-processor';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule, JwtAuthModule, GmailModule, AnalysisModule],
  controllers: [GmailPushController, GmailSyncController],
  providers: [
    GmailPushInboxService,
    GmailPushOidcService,
    GmailPushOidcGuard,
    GmailSyncQueueService,
    GmailApiAdapter,
    GmailWatchService,
    GmailSyncSchedulerService,
    GmailSyncWorkerService,
    GmailIncrementalProcessorService,
    {
      provide: GMAIL_INCREMENTAL_PROCESSOR,
      useExisting: GmailIncrementalProcessorService,
    },
  ],
  exports: [GmailSyncQueueService, GmailApiAdapter, GmailWatchService],
})
export class GmailSyncModule {}
