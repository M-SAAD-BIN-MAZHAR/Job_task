import { Injectable } from '@nestjs/common';
import { LedgerRepository, LedgerFilters } from './repositories/ledger.repository';
import { LedgerEntry, LedgerOperation, LedgerSource } from './entities/ledger-entry.entity';

export interface CreateLedgerEntryDto {
  employeeId: string;
  operation: LedgerOperation;
  amount: number;
  source: LedgerSource;
  requestId?: string;
  syncCheckpointId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LedgerService {
  constructor(private readonly ledgerRepository: LedgerRepository) {}

  async createEntry(dto: CreateLedgerEntryDto): Promise<LedgerEntry> {
    return this.ledgerRepository.create(dto);
  }

  async debit(
    employeeId: string,
    amount: number,
    source: LedgerSource,
    requestId?: string,
    description?: string,
  ): Promise<LedgerEntry> {
    return this.createEntry({
      employeeId,
      operation: 'DEBIT',
      amount,
      source,
      requestId,
      description,
    });
  }

  async credit(
    employeeId: string,
    amount: number,
    source: LedgerSource,
    requestId?: string,
    description?: string,
  ): Promise<LedgerEntry> {
    return this.createEntry({
      employeeId,
      operation: 'CREDIT',
      amount,
      source,
      requestId,
      description,
    });
  }

  async getHistory(employeeId: string, filters?: LedgerFilters): Promise<LedgerEntry[]> {
    return this.ledgerRepository.findByEmployee(employeeId, filters);
  }

  async getNetBalance(employeeId: string): Promise<number> {
    return this.ledgerRepository.calculateNetBalance(employeeId);
  }
}
