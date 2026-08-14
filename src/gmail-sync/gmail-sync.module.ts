import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../auth/jwt.module';
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

@Module({
  imports: [JwtAuthModule],
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
  ],
  exports: [GmailSyncQueueService, GmailApiAdapter, GmailWatchService],
})
export class GmailSyncModule {}
