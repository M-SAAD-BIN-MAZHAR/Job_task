import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { BalanceRepository } from './repositories/balance.repository';
import { BalanceRecord } from './entities/balance-record.entity';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';
import { HcmModule } from '../hcm/hcm.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BalanceRecord]),
    LedgerModule,
    AuditModule,
    HcmModule,
    SyncModule,
  ],
  controllers: [BalanceController],
  providers: [BalanceService, BalanceRepository],
  exports: [BalanceService, BalanceRepository],
})
export class BalanceModule {}
