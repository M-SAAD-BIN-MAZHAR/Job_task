import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalSagaOrchestrator } from './approval-saga.orchestrator';
import { OutboxRepository } from './outbox/outbox.repository';
import { OutboxEvent } from './outbox/outbox-event.entity';
import { RollbackHandler } from './compensation/rollback.handler';
import { BalanceModule } from '../balance/balance.module';
import { AuditModule } from '../audit/audit.module';
import { HcmModule } from '../hcm/hcm.module';
import { LedgerModule } from '../ledger/ledger.module';
import { RequestModule } from '../request/request.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent]),
    BalanceModule,
    AuditModule,
    HcmModule,
    LedgerModule,
    forwardRef(() => RequestModule),
  ],
  providers: [ApprovalSagaOrchestrator, OutboxRepository, RollbackHandler],
  exports: [ApprovalSagaOrchestrator, OutboxRepository, RollbackHandler],
})
export class SagaModule {}
