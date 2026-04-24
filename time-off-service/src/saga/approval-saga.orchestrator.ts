import { Injectable, Inject, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TimeOffRequest } from '../request/entities/time-off-request.entity';
import { BalanceService } from '../balance/balance.service';
import { AuditService } from '../audit/audit.service';
import { OutboxRepository } from './outbox/outbox.repository';
import { RequestRepository } from '../request/repositories/request.repository';
import { IHCMClient, HCM_CLIENT } from '../hcm/hcm-client.interface';
import { RollbackHandler } from './compensation/rollback.handler';
import { validateTransition } from '../request/state-machine/request-state-machine';
import { OutboxEvent } from './outbox/outbox-event.entity';
import { BalanceRecord } from '../balance/entities/balance-record.entity';

export interface SagaResult {
  success: boolean;
  finalStatus: string;
  errorMessage?: string;
}

@Injectable()
export class ApprovalSagaOrchestrator {
  private readonly logger = new Logger(ApprovalSagaOrchestrator.name);

  constructor(
    private readonly balanceService: BalanceService,
    private readonly auditService: AuditService,
    private readonly outboxRepository: OutboxRepository,
    private readonly requestRepository: RequestRepository,
    private readonly rollbackHandler: RollbackHandler,
    @Inject(HCM_CLIENT) private readonly hcmClient: IHCMClient,
    private readonly dataSource: DataSource,
  ) {}

  async executeApprovalSaga(request: TimeOffRequest, managerId: string): Promise<SagaResult> {
    this.logger.log(`Starting approval saga for request ${request.id}`);

    validateTransition(request.status, 'APPROVED');

    const idempotencyKey = uuidv4();

    // Phase 1: Atomic local commit — deduct balance + create outbox event
    await this.dataSource.transaction(async (manager) => {
      // Deduct balance with pessimistic lock
      const balance = await manager.findOne(BalanceRecord, {
        where: { employeeId: request.employeeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance || balance.availableHours < request.hoursRequested) {
        throw new Error(
          `Insufficient balance: ${balance?.availableHours ?? 0} < ${request.hoursRequested}`,
        );
      }

      balance.availableHours = parseFloat(
        (balance.availableHours - request.hoursRequested).toFixed(2),
      );
      balance.usedHours = parseFloat((balance.usedHours + request.hoursRequested).toFixed(2));
      await manager.save(BalanceRecord, balance);

      // Create outbox event
      const outboxEvent = manager.create(OutboxEvent, {
        requestId: request.id,
        status: 'PENDING',
        payload: {
          employeeId: request.employeeId,
          startDate: request.startDate.toString(),
          endDate: request.endDate.toString(),
          hoursRequested: request.hoursRequested,
          requestId: request.id,
        },
        idempotencyKey,
      });
      await manager.save(OutboxEvent, outboxEvent);

      // Update request status
      request.status = 'PENDING'; // stays PENDING until HCM confirms
      await manager.save(request);
    });

    await this.auditService.log({
      operationType: 'SAGA_STARTED',
      actorId: managerId,
      actorRole: 'MANAGER',
      entityId: request.id,
      entityType: 'TimeOffRequest',
      newState: { status: 'PENDING', idempotencyKey },
    });

    this.logger.log(`Phase 1 complete for request ${request.id}. Outbox event created.`);

    return {
      success: true,
      finalStatus: 'PENDING',
    };
  }

  async executeRollbackSaga(requestId: string, reason: string): Promise<void> {
    await this.rollbackHandler.rollback(requestId, reason);
  }
}
