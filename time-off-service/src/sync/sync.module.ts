import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { ReconciliationService } from './reconciliation.service';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { SyncRepository } from './repositories/sync.repository';
import { SyncCheckpoint } from './entities/sync-checkpoint.entity';
import { HcmModule } from '../hcm/hcm.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SyncCheckpoint]),
    HcmModule,
    LedgerModule,
    AuditModule,
    // Use forwardRef to avoid circular dependency with BalanceModule
    forwardRef(() => require('../balance/balance.module').BalanceModule),
  ],
  controllers: [WebhookController],
  providers: [SyncService, ReconciliationService, WebhookService, SyncRepository],
  exports: [SyncService, ReconciliationService, WebhookService, SyncRepository],
})
export class SyncModule {}
