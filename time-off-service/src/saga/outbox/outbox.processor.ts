import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { OutboxRepository } from './outbox.repository';
import { RequestRepository } from '../../request/repositories/request.repository';
import { AuditService } from '../../audit/audit.service';
import { RollbackHandler } from '../compensation/rollback.handler';
import { IHCMClient, HCM_CLIENT } from '../../hcm/hcm-client.interface';
import { OutboxEvent } from './outbox-event.entity';

const MAX_RETRIES = 5;
const BACKOFF_DELAYS = [0, 1000, 2000, 4000, 8000]; // ms

@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly requestRepository: RequestRepository,
    private readonly auditService: AuditService,
    private readonly rollbackHandler: RollbackHandler,
    @Inject(HCM_CLIENT) private readonly hcmClient: IHCMClient,
    private readonly configService: ConfigService,
  ) {}

  @Cron('*/5 * * * * *') // every 5 seconds
  async processAll(): Promise<void> {
    const pending = await this.outboxRepository.findPending();
    if (pending.length === 0) return;

    this.logger.debug(`Processing ${pending.length} pending outbox events`);

    for (const event of pending) {
      await this.processEvent(event);
    }
  }

  async processEvent(event: OutboxEvent): Promise<void> {
    const delay = BACKOFF_DELAYS[event.retryCount] ?? 0;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));

    try {
      const hcmResponse = await this.hcmClient.submitApproval(
        event.payload,
        event.idempotencyKey ?? event.id,
      );

      if (!hcmResponse.success) {
        throw new Error(`HCM rejected approval: ${hcmResponse.errorCode} - ${hcmResponse.message}`);
      }

      // Verify HCM actually applied the deduction
      const verified = await this.hcmClient.verifyApproval(
        event.payload.employeeId,
        event.payload.hoursRequested,
      );

      if (!verified) {
        throw new Error('HCM verification failed: balance not updated after approval');
      }

      // Success — mark delivered and approve request
      await this.outboxRepository.updateStatus(event.id, 'DELIVERED', {
        deliveredAt: new Date(),
      });

      const request = await this.requestRepository.findById(event.requestId);
      if (request) {
        request.status = 'APPROVED';
        request.resolvedAt = new Date();
        await this.requestRepository.save(request);
      }

      await this.auditService.log({
        operationType: 'SAGA_COMPLETED',
        actorId: 'SYSTEM',
        actorRole: 'SYSTEM',
        entityId: event.requestId,
        entityType: 'TimeOffRequest',
        newState: { status: 'APPROVED' },
      });

      this.logger.log(`Outbox event ${event.id} delivered successfully`);
    } catch (err: any) {
      const newRetryCount = event.retryCount + 1;
      this.logger.warn(
        `Outbox event ${event.id} failed (attempt ${newRetryCount}/${MAX_RETRIES}): ${err.message}`,
      );

      if (newRetryCount >= MAX_RETRIES) {
        this.logger.error(`Max retries reached for outbox event ${event.id}. Triggering rollback.`);
        await this.rollbackHandler.rollback(event.requestId, err.message);

        await this.auditService.log({
          operationType: 'SAGA_FAILED',
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          entityId: event.requestId,
          entityType: 'TimeOffRequest',
          newState: { error: err.message, retries: newRetryCount },
        });
      } else {
        await this.outboxRepository.updateStatus(event.id, 'PENDING', {
          retryCount: newRetryCount,
          errorMessage: err.message,
        });
      }
    }
  }
}
