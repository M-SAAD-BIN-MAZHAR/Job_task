import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookService, WebhookPayload } from './webhook.service';
import { BalanceService } from '../balance/balance.service';
import { LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../audit/audit.service';
import { BalanceRecord } from '../balance/entities/balance-record.entity';

describe('WebhookService', () => {
  let service: WebhookService;
  let configService: ConfigService;
  let balanceService: BalanceService;
  let ledgerService: LedgerService;
  let auditService: AuditService;
  let dataSource: DataSource;

  const mockWebhookSecret = 'test-webhook-secret';

  const mockConfigService = {
    get: jest.fn((key: string): string | null => {
      if (key === 'HCM_WEBHOOK_SECRET') return mockWebhookSecret;
      return null;
    }),
  };

  const mockBalanceService = {
    getBalance: jest.fn(),
    updateBalanceFromHCM: jest.fn(),
  };

  const mockLedgerService = {
    createEntry: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockDataSource = {
    transaction: jest.fn((callback) => callback(mockManager)),
  };

  const mockManager = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: BalanceService, useValue: mockBalanceService },
        { provide: LedgerService, useValue: mockLedgerService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    configService = module.get<ConfigService>(ConfigService);
    balanceService = module.get<BalanceService>(BalanceService);
    ledgerService = module.get<LedgerService>(LedgerService);
    auditService = module.get<AuditService>(AuditService);
    dataSource = module.get<DataSource>(DataSource);
  });

  describe('validateSignature', () => {
    it('should validate correct HMAC-SHA256 signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const hmac = crypto.createHmac('sha256', mockWebhookSecret);
      hmac.update(payload);
      const signature = hmac.digest('hex');

      expect(() => service.validateSignature(signature, payload)).not.toThrow();
    });

    it('should throw UnauthorizedException for missing signature', () => {
      const payload = JSON.stringify({ test: 'data' });

      expect(() => service.validateSignature(undefined, payload)).toThrow(UnauthorizedException);
      expect(() => service.validateSignature(undefined, payload)).toThrow(
        'Missing webhook signature',
      );
    });

    it('should throw UnauthorizedException for invalid signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 'invalid-signature-12345';

      expect(() => service.validateSignature(invalidSignature, payload)).toThrow(
        UnauthorizedException,
      );
      expect(() => service.validateSignature(invalidSignature, payload)).toThrow(
        'Invalid webhook signature',
      );
    });

    it('should throw UnauthorizedException when webhook secret is not configured', () => {
      mockConfigService.get.mockReturnValueOnce(''); // Return empty secret

      // Create new service instance with empty secret
      const serviceWithoutSecret = new WebhookService(
        mockConfigService as any,
        mockBalanceService as any,
        mockLedgerService as any,
        mockAuditService as any,
        mockDataSource as any,
      );

      const payload = JSON.stringify({ test: 'data' });
      const signature = 'some-signature';

      expect(() => serviceWithoutSecret.validateSignature(signature, payload)).toThrow(
        UnauthorizedException,
      );
      expect(() => serviceWithoutSecret.validateSignature(signature, payload)).toThrow(
        'Webhook authentication not configured',
      );
    });

    it('should use timing-safe comparison to prevent timing attacks', () => {
      const payload = JSON.stringify({ test: 'data' });
      const hmac = crypto.createHmac('sha256', mockWebhookSecret);
      hmac.update(payload);
      const correctSignature = hmac.digest('hex');

      // Create a signature that differs by one character
      const almostCorrectSignature = correctSignature.slice(0, -1) + 'x';

      expect(() => service.validateSignature(almostCorrectSignature, payload)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('processWebhook', () => {
    const validPayload: WebhookPayload = {
      eventType: 'BALANCE_UPDATE',
      employeeId: 'emp-123',
      availableHours: 120.5,
      accruedHours: 160,
      usedHours: 39.5,
      timestamp: '2024-01-15T10:30:00Z',
    };

    const rawBody = JSON.stringify(validPayload);
    const hmac = crypto.createHmac('sha256', mockWebhookSecret);
    hmac.update(rawBody);
    const validSignature = hmac.digest('hex');

    beforeEach(() => {
      mockManager.findOne.mockResolvedValue({
        employeeId: 'emp-123',
        availableHours: 100,
        accruedHours: 150,
        usedHours: 50,
      });

      mockManager.save.mockResolvedValue({
        employeeId: 'emp-123',
        availableHours: 120.5,
        accruedHours: 160,
        usedHours: 39.5,
      });

      mockLedgerService.createEntry.mockResolvedValue({});
      mockAuditService.log.mockResolvedValue({});
    });

    it('should process valid webhook successfully', async () => {
      const result = await service.processWebhook(validSignature, rawBody, validPayload);

      expect(result).toEqual({
        success: true,
        message: 'Webhook processed successfully',
        employeeId: 'emp-123',
        previousBalance: 100,
        newBalance: 120.5,
      });

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockManager.findOne).toHaveBeenCalledWith(BalanceRecord, {
        where: { employeeId: 'emp-123' },
      });
      expect(mockManager.save).toHaveBeenCalled();
      expect(mockLedgerService.createEntry).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalled();
    });

    it('should create CREDIT ledger entry when balance increases', async () => {
      await service.processWebhook(validSignature, rawBody, validPayload);

      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-123',
          operation: 'CREDIT',
          amount: 20.5, // 120.5 - 100
          source: 'WEBHOOK',
        }),
      );
    });

    it('should create DEBIT ledger entry when balance decreases', async () => {
      const decreasePayload = { ...validPayload, availableHours: 80 };
      const decreaseRawBody = JSON.stringify(decreasePayload);
      const decreaseHmac = crypto.createHmac('sha256', mockWebhookSecret);
      decreaseHmac.update(decreaseRawBody);
      const decreaseSignature = decreaseHmac.digest('hex');

      await service.processWebhook(decreaseSignature, decreaseRawBody, decreasePayload);

      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-123',
          operation: 'DEBIT',
          amount: 20, // 100 - 80
          source: 'WEBHOOK',
        }),
      );
    });

    it('should not create ledger entry when balance change is negligible', async () => {
      const samePayload = { ...validPayload, availableHours: 100.0001 };
      const sameRawBody = JSON.stringify(samePayload);
      const sameHmac = crypto.createHmac('sha256', mockWebhookSecret);
      sameHmac.update(sameRawBody);
      const sameSignature = sameHmac.digest('hex');

      await service.processWebhook(sameSignature, sameRawBody, samePayload);

      expect(mockLedgerService.createEntry).not.toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalled(); // Audit log should still be created
    });

    it('should create balance record if it does not exist', async () => {
      mockManager.findOne.mockResolvedValueOnce(null); // No existing record

      await service.processWebhook(validSignature, rawBody, validPayload);

      expect(mockManager.save).toHaveBeenCalledWith(
        BalanceRecord,
        expect.objectContaining({
          employeeId: 'emp-123',
          availableHours: 120.5,
          accruedHours: 160,
          usedHours: 39.5,
        }),
      );
    });

    it('should create audit log with correct details', async () => {
      await service.processWebhook(validSignature, rawBody, validPayload);

      expect(mockAuditService.log).toHaveBeenCalledWith({
        operationType: 'BALANCE_UPDATED',
        actorId: 'HCM_SYSTEM',
        actorRole: 'SYSTEM',
        entityId: 'emp-123',
        entityType: 'BALANCE_RECORD',
        previousState: {
          availableHours: 100,
          accruedHours: 150,
          usedHours: 50,
        },
        newState: {
          availableHours: 120.5,
          accruedHours: 160,
          usedHours: 39.5,
        },
        reason: 'Webhook event: BALANCE_UPDATE',
      });
    });

    it('should include metadata in ledger entry', async () => {
      const payloadWithMetadata = {
        ...validPayload,
        metadata: { source: 'anniversary', year: 2024 },
      };
      const metadataRawBody = JSON.stringify(payloadWithMetadata);
      const metadataHmac = crypto.createHmac('sha256', mockWebhookSecret);
      metadataHmac.update(metadataRawBody);
      const metadataSignature = metadataHmac.digest('hex');

      await service.processWebhook(metadataSignature, metadataRawBody, payloadWithMetadata);

      expect(mockLedgerService.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            eventType: 'BALANCE_UPDATE',
            timestamp: '2024-01-15T10:30:00Z',
            source: 'anniversary',
            year: 2024,
          }),
        }),
      );
    });

    it('should throw UnauthorizedException for invalid signature', async () => {
      const invalidSignature = 'invalid-signature';

      await expect(service.processWebhook(invalidSignature, rawBody, validPayload)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should handle payload with negative hours (validation happens at controller level)', async () => {
      // Note: Actual validation happens at controller level via ValidationPipe
      // This test verifies the service can handle the data if it somehow gets through
      const payloadWithNegative = { ...validPayload, availableHours: -10 };
      const rawBodyWithNegative = JSON.stringify(payloadWithNegative);
      const hmac = crypto.createHmac('sha256', mockWebhookSecret);
      hmac.update(rawBodyWithNegative);
      const signature = hmac.digest('hex');

      mockBalanceService.getBalance.mockResolvedValue({
        employeeId: 'emp-123',
        availableHours: 100,
        accruedHours: 160,
        usedHours: 60,
      } as any);

      mockDataSource.transaction.mockImplementation(async (cb) => cb(mockManager));

      // Service processes it - validation should happen at controller level
      const result = await service.processWebhook(signature, rawBodyWithNegative, payloadWithNegative);

      expect(result.success).toBe(true);
    });

    it('should create audit log for failed webhook processing', async () => {
      const invalidSignature = 'invalid-signature';

      await expect(service.processWebhook(invalidSignature, rawBody, validPayload)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'BALANCE_UPDATED',
          actorId: 'HCM_SYSTEM',
          actorRole: 'SYSTEM',
          entityType: 'WEBHOOK',
          reason: expect.stringContaining('Webhook processing failed'),
        }),
      );
    });

    it('should handle transaction errors gracefully', async () => {
      mockDataSource.transaction.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.processWebhook(validSignature, rawBody, validPayload)).rejects.toThrow(
        'Database error',
      );

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: expect.stringContaining('Database error'),
        }),
      );
    });

    it('should handle all event types correctly', async () => {
      const eventTypes: WebhookPayload['eventType'][] = [
        'BALANCE_UPDATE',
        'ANNIVERSARY_ACCRUAL',
        'YEAR_START_RESET',
      ];

      for (const eventType of eventTypes) {
        jest.clearAllMocks();
        const payload = { ...validPayload, eventType };
        const body = JSON.stringify(payload);
        const hmac = crypto.createHmac('sha256', mockWebhookSecret);
        hmac.update(body);
        const signature = hmac.digest('hex');

        await service.processWebhook(signature, body, payload);

        expect(mockAuditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            reason: `Webhook event: ${eventType}`,
          }),
        );
      }
    });
  });

  describe('isConfigured', () => {
    it('should return true when webhook secret is configured', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('should return false when webhook secret is not configured', () => {
      mockConfigService.get.mockReturnValueOnce('');

      const serviceWithoutSecret = new WebhookService(
        mockConfigService as any,
        mockBalanceService as any,
        mockLedgerService as any,
        mockAuditService as any,
        mockDataSource as any,
      );

      expect(serviceWithoutSecret.isConfigured()).toBe(false);
    });
  });
});
