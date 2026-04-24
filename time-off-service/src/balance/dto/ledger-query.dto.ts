import { IsOptional, IsDateString, IsIn } from 'class-validator';
import { LedgerOperation, LedgerSource } from '../../ledger/entities/ledger-entry.entity';

export class LedgerQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(['DEBIT', 'CREDIT'])
  operation?: LedgerOperation;

  @IsOptional()
  @IsIn(['APPROVAL', 'ROLLBACK', 'HCM_SYNC', 'WEBHOOK', 'RECONCILIATION'])
  source?: LedgerSource;
}
