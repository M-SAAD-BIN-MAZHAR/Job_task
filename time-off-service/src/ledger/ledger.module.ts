import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerService } from './ledger.service';
import { LedgerRepository } from './repositories/ledger.repository';
import { LedgerEntry } from './entities/ledger-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerEntry])],
  providers: [LedgerService, LedgerRepository],
  exports: [LedgerService, LedgerRepository],
})
export class LedgerModule {}
