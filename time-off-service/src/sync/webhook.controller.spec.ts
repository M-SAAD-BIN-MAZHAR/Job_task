import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhookController } from './webhook.controller';
import { WebhookService, WebhookPayload, WebhookResponse } from './webhook.service';
import { WebhookPayloadDto } from './dto';

describe('WebhookController', () => {
  let controller: WebhookController;
  let webhookService: WebhookService;

  const mockWebhookService = {
    processWebhook: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [{ provide: WebhookService, useValue: mockWebhookService }],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
    webhookService = module.get<WebhookService>(WebhookService);
  });

  describe('handleWebhook', () => {
    const validPayload: WebhookPayload = {
      eventType: 'BALANCE_UPDATE',
      employeeId: 'emp-123',
      availableHours: 120.5,
      accruedHours: 160,
      usedHours: 39.5,
      timestamp: '2024-01-15T10:30:00Z',
    };

    const mockWebhookSecret = 'test-webhook-secret';
    const rawBody = JSON.stringify(validPayload);
    const hmac = crypto.createHmac('sha256', mockWebhookSecret);
    hmac.update(rawBody);
    const validSignature = hmac.digest('hex');

    const mockRequest = {
      rawBody: Buffer.from(rawBody),
    };

    const successResponse: WebhookResponse = {
      success: true,
      message: 'Webhook processed successfully',
      employeeId: 'emp-123',
      previousBalance: 100,
      newBalance: 120.5,
    };

    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should process valid webhook successfully', async () => {
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      const result = await controller.handleWebhook(validSignature, validPayload, mockRequest as any);

      expect(result).toEqual(successResponse);
      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        validSignature,
        rawBody,
        validPayload,
      );
    });

    it('should extract raw body from request', async () => {
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      await controller.handleWebhook(validSignature, validPayload, mockRequest as any);

      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        validSignature,
        rawBody,
        validPayload,
      );
    });

    it('should use JSON.stringify as fallback when rawBody is not available', async () => {
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      const requestWithoutRawBody = {};

      await controller.handleWebhook(
        validSignature,
        validPayload,
        requestWithoutRawBody as any,
      );

      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        validSignature,
        JSON.stringify(validPayload),
        validPayload,
      );
    });

    it('should pass signature header to service', async () => {
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      await controller.handleWebhook(validSignature, validPayload, mockRequest as any);

      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        validSignature,
        expect.any(String),
        validPayload,
      );
    });

    it('should handle missing signature header', async () => {
      mockWebhookService.processWebhook.mockRejectedValue(
        new UnauthorizedException('Missing webhook signature'),
      );

      await expect(
        controller.handleWebhook(undefined, validPayload, mockRequest as any),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        undefined,
        rawBody,
        validPayload,
      );
    });

    it('should propagate UnauthorizedException from service', async () => {
      mockWebhookService.processWebhook.mockRejectedValue(
        new UnauthorizedException('Invalid webhook signature'),
      );

      await expect(
        controller.handleWebhook('invalid-signature', validPayload, mockRequest as any),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        controller.handleWebhook('invalid-signature', validPayload, mockRequest as any),
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('should propagate BadRequestException from service', async () => {
      const invalidPayload = { ...validPayload, availableHours: -10 };
      mockWebhookService.processWebhook.mockRejectedValue(
        new BadRequestException('Invalid payload: availableHours must be a non-negative number'),
      );

      await expect(
        controller.handleWebhook(validSignature, invalidPayload, mockRequest as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle all event types', async () => {
      const eventTypes: WebhookPayload['eventType'][] = [
        'BALANCE_UPDATE',
        'ANNIVERSARY_ACCRUAL',
        'YEAR_START_RESET',
      ];

      for (const eventType of eventTypes) {
        jest.clearAllMocks();
        const payload = { ...validPayload, eventType };
        mockWebhookService.processWebhook.mockResolvedValue({
          ...successResponse,
          employeeId: payload.employeeId,
        });

        await controller.handleWebhook(validSignature, payload, mockRequest as any);

        expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
          validSignature,
          expect.any(String),
          payload,
        );
      }
    });

    it('should handle webhook with metadata', async () => {
      const payloadWithMetadata = {
        ...validPayload,
        metadata: { source: 'anniversary', year: 2024 },
      };
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      await controller.handleWebhook(validSignature, payloadWithMetadata, mockRequest as any);

      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        validSignature,
        expect.any(String),
        payloadWithMetadata,
      );
    });

    it('should return 200 OK status code on success', async () => {
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      const result = await controller.handleWebhook(validSignature, validPayload, mockRequest as any);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Webhook processed successfully');
    });

    it('should include balance change details in response', async () => {
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      const result = await controller.handleWebhook(validSignature, validPayload, mockRequest as any);

      expect(result.employeeId).toBe('emp-123');
      expect(result.previousBalance).toBe(100);
      expect(result.newBalance).toBe(120.5);
    });

    it('should handle service errors gracefully', async () => {
      mockWebhookService.processWebhook.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        controller.handleWebhook(validSignature, validPayload, mockRequest as any),
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle empty payload', async () => {
      const emptyPayload = {
        eventType: 'BALANCE_UPDATE',
        employeeId: '',
        availableHours: 0,
        accruedHours: 0,
        usedHours: 0,
        timestamp: new Date().toISOString(),
      } as WebhookPayloadDto;

      mockWebhookService.processWebhook.mockRejectedValue(
        new BadRequestException('Invalid payload: employeeId is required'),
      );

      await expect(
        controller.handleWebhook(validSignature, emptyPayload, mockRequest as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle malformed JSON in raw body', async () => {
      const malformedRequest = {
        rawBody: Buffer.from('{ invalid json }'),
      };

      const malformedPayload = {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: new Date().toISOString(),
      } as WebhookPayloadDto;

      mockWebhookService.processWebhook.mockRejectedValue(
        new BadRequestException('Invalid payload'),
      );

      await expect(
        controller.handleWebhook(validSignature, malformedPayload, malformedRequest as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should log webhook processing', async () => {
      const loggerSpy = jest.spyOn(controller['logger'], 'log');
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      await controller.handleWebhook(validSignature, validPayload, mockRequest as any);

      expect(loggerSpy).toHaveBeenCalledWith('Received webhook request from HCM system');
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Webhook processed successfully'),
      );
    });

    it('should handle concurrent webhook requests', async () => {
      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      const requests = Array(5)
        .fill(null)
        .map(() => controller.handleWebhook(validSignature, validPayload, mockRequest as any));

      const results = await Promise.all(requests);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
      expect(mockWebhookService.processWebhook).toHaveBeenCalledTimes(5);
    });

    it('should handle different employee IDs', async () => {
      const employeeIds = ['emp-001', 'emp-002', 'emp-003'];

      for (const employeeId of employeeIds) {
        jest.clearAllMocks();
        const payload = { ...validPayload, employeeId };
        mockWebhookService.processWebhook.mockResolvedValue({
          ...successResponse,
          employeeId,
        });

        const result = await controller.handleWebhook(validSignature, payload, mockRequest as any);

        expect(result.employeeId).toBe(employeeId);
      }
    });

    it('should handle large payloads', async () => {
      const largePayload = {
        ...validPayload,
        metadata: {
          largeData: 'x'.repeat(10000),
          nestedObject: {
            level1: { level2: { level3: { data: 'deep' } } },
          },
        },
      };

      const largeRawBody = JSON.stringify(largePayload);
      const largeRequest = {
        rawBody: Buffer.from(largeRawBody),
      };

      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      await controller.handleWebhook(validSignature, largePayload, largeRequest as any);

      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        validSignature,
        largeRawBody,
        largePayload,
      );
    });

    it('should handle zero balance values', async () => {
      const zeroBalancePayload = {
        ...validPayload,
        availableHours: 0,
        accruedHours: 0,
        usedHours: 0,
      };

      mockWebhookService.processWebhook.mockResolvedValue({
        ...successResponse,
        previousBalance: 0,
        newBalance: 0,
      });

      const result = await controller.handleWebhook(
        validSignature,
        zeroBalancePayload,
        mockRequest as any,
      );

      expect(result.success).toBe(true);
      expect(result.previousBalance).toBe(0);
      expect(result.newBalance).toBe(0);
    });

    it('should handle decimal hour values', async () => {
      const decimalPayload = {
        ...validPayload,
        availableHours: 123.456789,
        accruedHours: 160.123456,
        usedHours: 36.666667,
      };

      mockWebhookService.processWebhook.mockResolvedValue(successResponse);

      await controller.handleWebhook(validSignature, decimalPayload, mockRequest as any);

      expect(mockWebhookService.processWebhook).toHaveBeenCalledWith(
        validSignature,
        expect.any(String),
        decimalPayload,
      );
    });
  });
});
