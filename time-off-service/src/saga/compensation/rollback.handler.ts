import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BalanceService } from '../../balance/balance.service';
import { AuditService } from '../../audit/audit.service';
import { OutboxRepository } from '../outbox/outbox.repository';
import { RequestRepository } from '../../request/repositories/request.repository';

@Injectable()
export class RollbackHandler {
  private readonly logger = new Logger(RollbackHandler.name);

  constructor(
    private readonly balanceService: BalanceService,
    private readonly auditService: AuditService,
    private readonly outboxRepository: OutboxRepository,
    private readonly requestRepository: RequestRepository,
    private readonly dataSource: DataSource,
  ) {}

  async rollback(requestId: string, reason: string): Promise<void> {
    this.logger.warn(`Rolling back saga for request ${requestId}: ${reason}`);

    const request = await this.requestRepository.findById(requestId);
    if (!request) {
      this.logger.error(`Cannot rollback: request ${requestId} not found`);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      // Restore balance
      await this.balanceService.restoreBalance(
        request.employeeId,
        request.hoursRequested,
        requestId,
      );

      // Update request status to HCM_FAILED
      request.status = 'REJECTED';
      request.rejectionReason = reason;
      request.resolvedAt = new Date();
      await manager.save(request);

      // Mark outbox event as failed
      const outboxEvent = await this.outboxRepository.findByRequestId(requestId);
      if (outboxEvent) {
        await this.outboxRepository.updateStatus(outboxEvent.id, 'FAILED', {
          errorMessage: reason,
        });
      }
    });

    await this.auditService.log({
      operationType: 'SAGA_ROLLED_BACK',
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      entityId: requestId,
      entityType: 'TimeOffRequest',
      newState: { status: 'REJECTED', reason },
    });

    this.logger.log(`Rollback complete for request ${requestId}`);
  }
}
