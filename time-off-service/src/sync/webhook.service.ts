import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { BalanceService } from '../balance/balance.service';
import { LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../audit/audit.service';
import { BalanceRecord } from '../balance/entities/balance-record.entity';
import { WebhookPayloadDto } from './dto';

export interface WebhookPayload {
  eventType: 'BALANCE_UPDATE' | 'ANNIVERSARY_ACCRUAL' | 'YEAR_START_RESET';
  employeeId: string;
  availableHours: number;
  accruedHours: number;
  usedHours: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookResponse {
  success: boolean;
  message: string;
  employeeId?: string;
  previousBalance?: number;
  newBalance?: number;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly balanceService: BalanceService,
    private readonly ledgerService: LedgerService,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
  ) {
    this.webhookSecret = this.configService.get<string>('HCM_WEBHOOK_SECRET') || '';
    if (!this.webhookSecret) {
      this.logger.warn('HCM_WEBHOOK_SECRET not configured - webhook authentication will fail');
    }
  }

  /**
   * Validate HMAC-SHA256 signature on webhook request
   * Signature is passed in X-HCM-Signature header
   *
   * @param signature - The signature from the X-HCM-Signature header
   * @param payload - The raw request body as string
   * @returns true if signature is valid
   * @throws UnauthorizedException if signature is invalid
   */
  validateSignature(signature: string | undefined, payload: string): boolean {
    if (!signature) {
      this.logger.error('Missing X-HCM-Signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!this.webhookSecret) {
      this.logger.error('HCM_WEBHOOK_SECRET not configured');
      throw new UnauthorizedException('Webhook authentication not configured');
    }

    // Compute HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', this.webhookSecret);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');

    // Check if signatures have the same length before timing-safe comparison
    if (signature.length !== expectedSignature.length) {
      this.logger.error('Invalid webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Use timing-safe comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!isValid) {
      this.logger.error('Invalid webhook signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.debug('Webhook signature validated successfully');
    return true;
  }

  /**
   * Process webhook event and update balance
   * This is the main entry point for webhook processing
   *
   * Flow:
   * 1. Authenticate request (validate signature)
   * 2. Payload is already validated by ValidationPipe using WebhookPayloadDto
   * 3. Update balance record
   * 4. Create ledger entry
   * 5. Create audit log
   * 6. Return success response
   *
   * @param signature - The X-HCM-Signature header value
   * @param rawBody - The raw request body as string (for signature validation)
   * @param payload - The validated webhook payload (validated by ValidationPipe)
   * @returns WebhookResponse with success status and details
   */
  async processWebhook(
    signature: string | undefined,
    rawBody: string,
    payload: WebhookPayloadDto,
  ): Promise<WebhookResponse> {
    try {
      // Step 1: Authenticate request
      this.validateSignature(signature, rawBody);

      // Step 2: Payload is already validated by ValidationPipe
      this.logger.log(
        `Processing webhook event: ${payload.eventType} for employee ${payload.employeeId}`,
      );

      // Step 3-5: Update balance, create ledger entry, and audit log (transactional)
      const result = await this.updateBalanceFromWebhook(payload);

      this.logger.log(
        `Webhook processed successfully for employee ${payload.employeeId}: ${result.previousBalance} → ${result.newBalance}`,
      );

      return {
        success: true,
        message: 'Webhook processed successfully',
        employeeId: payload.employeeId,
        previousBalance: result.previousBalance,
        newBalance: result.newBalance,
      };
    } catch (error) {
      // Log the error
      this.logger.error(`Webhook processing failed: ${error.message}`, error.stack);

      // Create audit log for failed webhook
      try {
        await this.auditService.log({
          operationType: 'BALANCE_UPDATED',
          actorId: 'HCM_SYSTEM',
          actorRole: 'SYSTEM',
          entityType: 'WEBHOOK',
          reason: `Webhook processing failed: ${error.message}`,
          newState: { error: error.message, payload },
        });
      } catch (auditError) {
        this.logger.error(`Failed to create audit log for failed webhook: ${auditError.message}`);
      }

      // Re-throw the error to be handled by the controller
      throw error;
    }
  }

  /**
   * Update balance from webhook payload
   * Creates ledger entry and audit log in a transaction
   *
   * @param payload - Validated webhook payload
   * @returns Object with previous and new balance
   */
  private async updateBalanceFromWebhook(
    payload: WebhookPayload,
  ): Promise<{ previousBalance: number; newBalance: number }> {
    return this.dataSource.transaction(async (manager) => {
      // Find or create balance record
      let existing = await manager.findOne(BalanceRecord, {
        where: { employeeId: payload.employeeId },
      });

      const previousAvailable = existing?.availableHours ?? 0;
      const delta = payload.availableHours - previousAvailable;

      // Update or create balance record
      const record = await manager.save(BalanceRecord, {
        ...(existing ?? {}),
        employeeId: payload.employeeId,
        availableHours: payload.availableHours,
        accruedHours: payload.accruedHours,
        usedHours: payload.usedHours,
        lastSyncedAt: new Date(),
      });

      // Create ledger entry if there's a balance change
      if (Math.abs(delta) > 0.001) {
        await this.ledgerService.createEntry({
          employeeId: payload.employeeId,
          operation: delta > 0 ? 'CREDIT' : 'DEBIT',
          amount: Math.abs(delta),
          source: 'WEBHOOK',
          description: `Webhook ${payload.eventType}: ${previousAvailable} → ${payload.availableHours}`,
          metadata: {
            eventType: payload.eventType,
            timestamp: payload.timestamp,
            ...payload.metadata,
          },
        });
      }

      // Create audit log for successful webhook processing
      await this.auditService.log({
        operationType: 'BALANCE_UPDATED',
        actorId: 'HCM_SYSTEM',
        actorRole: 'SYSTEM',
        entityId: payload.employeeId,
        entityType: 'BALANCE_RECORD',
        previousState: {
          availableHours: previousAvailable,
          accruedHours: existing?.accruedHours ?? 0,
          usedHours: existing?.usedHours ?? 0,
        },
        newState: {
          availableHours: payload.availableHours,
          accruedHours: payload.accruedHours,
          usedHours: payload.usedHours,
        },
        reason: `Webhook event: ${payload.eventType}`,
      });

      return {
        previousBalance: previousAvailable,
        newBalance: payload.availableHours,
      };
    });
  }

  /**
   * Verify webhook secret is configured
   * Used for health checks
   */
  isConfigured(): boolean {
    return !!this.webhookSecret;
  }
}
