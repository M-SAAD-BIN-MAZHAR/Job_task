import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BalanceRepository } from './repositories/balance.repository';
import { LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../audit/audit.service';
import { IHCMClient, HCM_CLIENT, HCMBalanceResponse } from '../hcm/hcm-client.interface';
import { BalanceRecord } from './entities/balance-record.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';
import {
  InsufficientBalanceException,
  ConcurrentModificationException,
  HcmUnavailableException,
} from '../common/exceptions/custom-exceptions';

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);
  private hcmAvailabilityCache: { available: boolean; timestamp: number } | null = null;
  private readonly HCM_CACHE_TTL_MS = 30000; // 30 seconds

  constructor(
    private readonly balanceRepository: BalanceRepository,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService,
    @Inject(HCM_CLIENT) private readonly hcmClient: IHCMClient,
    private readonly dataSource: DataSource,
  ) {}

  async getBalance(employeeId: string): Promise<BalanceRecord> {
    return this.balanceRepository.findByEmployeeOrFail(employeeId);
  }

  async syncBalance(employeeId: string): Promise<BalanceRecord> {
    try {
      const hcmData = await this.hcmClient.fetchBalance(employeeId);
      return this.updateBalanceFromHCM(employeeId, hcmData);
    } catch (error) {
      this.logger.warn(`Failed to sync balance for ${employeeId}: ${error.message}`);
      // During HCM outage, return cached balance
      const cachedBalance = await this.balanceRepository.findByEmployeeOrFail(employeeId);
      this.logger.log(`Serving cached balance for ${employeeId} due to HCM unavailability`);
      throw new HcmUnavailableException(
        `HCM system is unavailable. Serving cached balance from ${cachedBalance.lastSyncedAt.toISOString()}`,
      );
    }
  }

  async updateBalanceFromHCM(
    employeeId: string,
    hcmData: HCMBalanceResponse,
  ): Promise<BalanceRecord> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(BalanceRecord, { where: { employeeId } });
      const previousAvailable = existing?.availableHours ?? 0;
      const delta = hcmData.availableHours - previousAvailable;

      const record = await manager.save(BalanceRecord, {
        ...(existing ?? {}),
        employeeId,
        availableHours: hcmData.availableHours,
        accruedHours: hcmData.accruedHours,
        usedHours: hcmData.usedHours,
        lastSyncedAt: new Date(),
      });

      if (Math.abs(delta) > 0.001) {
        await this.ledgerService.createEntry({
          employeeId,
          operation: delta > 0 ? 'CREDIT' : 'DEBIT',
          amount: Math.abs(delta),
          source: 'HCM_SYNC',
          description: `HCM sync: ${previousAvailable} → ${hcmData.availableHours}`,
        });
      }

      return record;
    });
  }

  async deductBalance(
    employeeId: string,
    hours: number,
    requestId: string,
  ): Promise<BalanceRecord> {
    return this.dataSource.transaction(async (manager) => {
      const record = await manager.findOne(BalanceRecord, {
        where: { employeeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) throw new ConcurrentModificationException(`Balance not found for ${employeeId}`);
      if (record.availableHours < hours) {
        throw new InsufficientBalanceException(
          `Requested ${hours} hours but available balance is ${record.availableHours}`,
        );
      }

      record.availableHours = parseFloat((record.availableHours - hours).toFixed(2));
      record.usedHours = parseFloat((record.usedHours + hours).toFixed(2));

      const saved = await manager.save(BalanceRecord, record);

      await this.ledgerService.debit(
        employeeId,
        hours,
        'APPROVAL',
        requestId,
        `Deducted ${hours}h for request ${requestId}`,
      );

      return saved;
    });
  }

  async restoreBalance(
    employeeId: string,
    hours: number,
    requestId: string,
  ): Promise<BalanceRecord> {
    return this.dataSource.transaction(async (manager) => {
      const record = await manager.findOne(BalanceRecord, {
        where: { employeeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) throw new ConcurrentModificationException(`Balance not found for ${employeeId}`);

      record.availableHours = parseFloat((record.availableHours + hours).toFixed(2));
      record.usedHours = parseFloat(Math.max(0, record.usedHours - hours).toFixed(2));

      const saved = await manager.save(BalanceRecord, record);

      await this.ledgerService.credit(
        employeeId,
        hours,
        'ROLLBACK',
        requestId,
        `Restored ${hours}h for rolled-back request ${requestId}`,
      );

      return saved;
    });
  }

  async getLedgerHistory(employeeId: string): Promise<LedgerEntry[]> {
    return this.ledgerService.getHistory(employeeId);
  }

  async isHcmAvailable(): Promise<boolean> {
    // Check cache first to avoid thundering herd
    if (this.hcmAvailabilityCache) {
      const age = Date.now() - this.hcmAvailabilityCache.timestamp;
      if (age < this.HCM_CACHE_TTL_MS) {
        this.logger.debug(
          `Using cached HCM availability: ${this.hcmAvailabilityCache.available} (age: ${age}ms)`,
        );
        return this.hcmAvailabilityCache.available;
      }
    }

    // Cache expired or doesn't exist, check HCM
    try {
      const available = await this.hcmClient.healthCheck();
      this.hcmAvailabilityCache = { available, timestamp: Date.now() };
      this.logger.debug(`HCM availability check: ${available}`);
      return available;
    } catch (error) {
      this.logger.warn(`HCM availability check failed: ${error.message}`);
      this.hcmAvailabilityCache = { available: false, timestamp: Date.now() };
      return false;
    }
  }

  /**
   * Clear the HCM availability cache
   * Useful for testing or forcing a fresh check
   */
  clearHcmAvailabilityCache(): void {
    this.hcmAvailabilityCache = null;
  }
}
