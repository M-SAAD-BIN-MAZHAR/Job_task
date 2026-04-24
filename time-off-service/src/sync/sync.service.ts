import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReconciliationService } from './reconciliation.service';
import { BalanceService } from '../balance/balance.service';
import { LedgerService } from '../ledger/ledger.service';
import { SyncRepository } from './repositories/sync.repository';
import { IHCMClient, HCM_CLIENT } from '../hcm/hcm-client.interface';
import { SyncCheckpoint, DriftDetail } from './entities/sync-checkpoint.entity';
import { BalanceRecord } from '../balance/entities/balance-record.entity';

const DRIFT_THRESHOLD = 0.1;
const BATCH_SIZE = 100;

export interface SyncResult {
  employeeId: string;
  driftDetected: boolean;
  localBalance: number;
  hcmBalance: number;
  difference?: number;
  corrected: boolean;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly reconciliationService: ReconciliationService,
    private readonly balanceService: BalanceService,
    private readonly ledgerService: LedgerService,
    private readonly syncRepository: SyncRepository,
    @Inject(HCM_CLIENT) private readonly hcmClient: IHCMClient,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Run batch reconciliation for all employees
   * Delegates to ReconciliationService for the actual work
   */
  async runBatchReconciliation(): Promise<SyncCheckpoint> {
    this.logger.log('Starting batch reconciliation via SyncService');
    return this.reconciliationService.runBatchReconciliation();
  }

  /**
   * Sync a single employee's balance with HCM
   * Detects drift and corrects if necessary
   */
  async syncEmployee(employeeId: string): Promise<SyncResult> {
    this.logger.log(`Syncing employee ${employeeId}`);

    // Fetch current local balance
    const localBalance = await this.balanceService.getBalance(employeeId);

    // Fetch HCM balance
    const hcmData = await this.hcmClient.fetchBalance(employeeId);

    // Calculate drift
    const drift = Math.abs(localBalance.availableHours - hcmData.availableHours);
    const driftDetected = drift > DRIFT_THRESHOLD;

    if (driftDetected) {
      this.logger.warn(
        `Drift detected for ${employeeId}: local=${localBalance.availableHours}, hcm=${hcmData.availableHours}, drift=${drift}`,
      );

      // Correct the drift
      const delta = hcmData.availableHours - localBalance.availableHours;
      await this.correctDrift(employeeId, localBalance, hcmData, delta);

      return {
        employeeId,
        driftDetected: true,
        localBalance: localBalance.availableHours,
        hcmBalance: hcmData.availableHours,
        difference: delta,
        corrected: true,
      };
    } else {
      // No drift, just update lastSyncedAt
      await this.dataSource.manager.update(
        BalanceRecord,
        { employeeId },
        { lastSyncedAt: new Date() },
      );

      return {
        employeeId,
        driftDetected: false,
        localBalance: localBalance.availableHours,
        hcmBalance: hcmData.availableHours,
        corrected: false,
      };
    }
  }

  /**
   * Detect drift for a single employee without correcting
   */
  async detectDrift(employeeId: string): Promise<{
    hasDrift: boolean;
    localBalance: number;
    hcmBalance: number;
    difference: number;
  }> {
    const localBalance = await this.balanceService.getBalance(employeeId);
    const hcmData = await this.hcmClient.fetchBalance(employeeId);

    const difference = hcmData.availableHours - localBalance.availableHours;
    const hasDrift = Math.abs(difference) > DRIFT_THRESHOLD;

    return {
      hasDrift,
      localBalance: localBalance.availableHours,
      hcmBalance: hcmData.availableHours,
      difference,
    };
  }

  /**
   * Sync multiple employees in a batch
   * More efficient than calling syncEmployee multiple times
   */
  async syncEmployeesBatch(employeeIds: string[]): Promise<SyncResult[]> {
    this.logger.log(`Syncing batch of ${employeeIds.length} employees`);

    const results: SyncResult[] = [];

    // Process in batches of BATCH_SIZE
    for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
      const batch = employeeIds.slice(i, i + BATCH_SIZE);
      const hcmBalances = await this.hcmClient.fetchBalancesBatch(batch);

      for (const employeeId of batch) {
        const hcmData = hcmBalances.get(employeeId);
        if (!hcmData) {
          this.logger.warn(`No HCM data for employee ${employeeId}`);
          continue;
        }

        const localBalance = await this.balanceService.getBalance(employeeId);
        const drift = Math.abs(localBalance.availableHours - hcmData.availableHours);
        const driftDetected = drift > DRIFT_THRESHOLD;

        if (driftDetected) {
          const delta = hcmData.availableHours - localBalance.availableHours;
          await this.correctDrift(employeeId, localBalance, hcmData, delta);

          results.push({
            employeeId,
            driftDetected: true,
            localBalance: localBalance.availableHours,
            hcmBalance: hcmData.availableHours,
            difference: delta,
            corrected: true,
          });
        } else {
          await this.dataSource.manager.update(
            BalanceRecord,
            { employeeId },
            { lastSyncedAt: new Date() },
          );

          results.push({
            employeeId,
            driftDetected: false,
            localBalance: localBalance.availableHours,
            hcmBalance: hcmData.availableHours,
            corrected: false,
          });
        }
      }
    }

    return results;
  }

  /**
   * Get the latest sync checkpoint with progress information
   */
  async getLatestCheckpoint(): Promise<SyncCheckpoint | null> {
    return this.syncRepository.findLatest();
  }

  /**
   * Get sync progress for an in-progress reconciliation
   */
  async getSyncProgress(): Promise<{
    inProgress: boolean;
    checkpoint?: SyncCheckpoint;
    progressPercentage?: number;
  }> {
    const checkpoint = await this.syncRepository.findLatest();

    if (!checkpoint || checkpoint.status !== 'IN_PROGRESS') {
      return { inProgress: false };
    }

    const progressPercentage =
      checkpoint.totalEmployees > 0
        ? Math.round((checkpoint.processedEmployees / checkpoint.totalEmployees) * 100)
        : 0;

    return {
      inProgress: true,
      checkpoint,
      progressPercentage,
    };
  }

  /**
   * Correct drift by creating a ledger entry and updating the balance
   * This is a transactional operation
   */
  private async correctDrift(
    employeeId: string,
    localBalance: BalanceRecord,
    hcmData: { availableHours: number; accruedHours: number; usedHours: number },
    delta: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Create ledger entry for the correction
      await this.ledgerService.createEntry({
        employeeId,
        operation: delta > 0 ? 'CREDIT' : 'DEBIT',
        amount: Math.abs(delta),
        source: 'RECONCILIATION',
        description: `Drift correction: ${localBalance.availableHours} → ${hcmData.availableHours}`,
      });

      // Update the balance record
      await manager.update(
        BalanceRecord,
        { employeeId },
        {
          availableHours: hcmData.availableHours,
          accruedHours: hcmData.accruedHours,
          usedHours: hcmData.usedHours,
          lastSyncedAt: new Date(),
        },
      );
    });

    this.logger.log(`Corrected drift for ${employeeId}: delta=${delta}`);
  }
}
