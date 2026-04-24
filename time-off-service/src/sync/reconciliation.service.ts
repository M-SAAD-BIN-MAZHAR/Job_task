import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { BalanceRepository } from '../balance/repositories/balance.repository';
import { LedgerService } from '../ledger/ledger.service';
import { SyncRepository } from './repositories/sync.repository';
import { IHCMClient, HCM_CLIENT } from '../hcm/hcm-client.interface';
import { SyncCheckpoint, DriftDetail } from './entities/sync-checkpoint.entity';
import { DataSource } from 'typeorm';
import { BalanceRecord } from '../balance/entities/balance-record.entity';

const DRIFT_THRESHOLD = 0.1;
const BATCH_SIZE = 100;

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly balanceRepository: BalanceRepository,
    private readonly ledgerService: LedgerService,
    private readonly syncRepository: SyncRepository,
    @Inject(HCM_CLIENT) private readonly hcmClient: IHCMClient,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 */4 * * *') // every 4 hours
  async scheduledReconciliation(): Promise<void> {
    this.logger.log('Starting scheduled batch reconciliation');
    await this.runBatchReconciliation();
  }

  async runBatchReconciliation(): Promise<SyncCheckpoint> {
    const checkpoint = await this.syncRepository.create({
      status: 'IN_PROGRESS',
      totalEmployees: 0,
      processedEmployees: 0,
      driftDetectedCount: 0,
      driftDetails: [],
    });

    try {
      const employeeIds = await this.balanceRepository.findAllEmployeeIds();
      checkpoint.totalEmployees = employeeIds.length;
      await this.syncRepository.save(checkpoint);

      const driftDetails: DriftDetail[] = [];

      // Process in batches of BATCH_SIZE
      for (let i = 0; i < employeeIds.length; i += BATCH_SIZE) {
        const batch = employeeIds.slice(i, i + BATCH_SIZE);
        const hcmBalances = await this.hcmClient.fetchBalancesBatch(batch);

        await Promise.all(
          batch.map(async (employeeId) => {
            const hcmBalance = hcmBalances.get(employeeId);
            if (!hcmBalance) return;

            const local = await this.balanceRepository.findByEmployee(employeeId);
            if (!local) return;

            const drift = Math.abs(local.availableHours - hcmBalance.availableHours);

            if (drift > DRIFT_THRESHOLD) {
              const delta = hcmBalance.availableHours - local.availableHours;
              this.logger.warn(
                `Drift detected for ${employeeId}: local=${local.availableHours}, hcm=${hcmBalance.availableHours}`,
              );

              await this.dataSource.transaction(async (manager) => {
                await this.ledgerService.createEntry({
                  employeeId,
                  operation: delta > 0 ? 'CREDIT' : 'DEBIT',
                  amount: Math.abs(delta),
                  source: 'RECONCILIATION',
                  syncCheckpointId: checkpoint.id,
                  description: `Reconciliation drift correction: ${local.availableHours} → ${hcmBalance.availableHours}`,
                });

                await manager.update(
                  BalanceRecord,
                  { employeeId },
                  {
                    availableHours: hcmBalance.availableHours,
                    accruedHours: hcmBalance.accruedHours,
                    usedHours: hcmBalance.usedHours,
                    lastSyncedAt: new Date(),
                  },
                );
              });

              driftDetails.push({
                employeeId,
                localBalance: local.availableHours,
                hcmBalance: hcmBalance.availableHours,
                difference: delta,
              });
              checkpoint.driftDetectedCount++;
            } else {
              await this.balanceRepository.upsert(employeeId, { lastSyncedAt: new Date() });
            }

            checkpoint.processedEmployees++;
          }),
        );

        await this.syncRepository.save(checkpoint);
      }

      checkpoint.status = 'COMPLETED';
      checkpoint.completedAt = new Date();
      checkpoint.driftDetails = driftDetails;
      await this.syncRepository.save(checkpoint);

      this.logger.log(
        `Reconciliation complete: ${checkpoint.processedEmployees} employees, ${checkpoint.driftDetectedCount} drifts`,
      );
    } catch (err: any) {
      checkpoint.status = 'FAILED';
      checkpoint.completedAt = new Date();
      await this.syncRepository.save(checkpoint);
      this.logger.error(`Reconciliation failed: ${err.message}`);
    }

    return checkpoint;
  }
}
