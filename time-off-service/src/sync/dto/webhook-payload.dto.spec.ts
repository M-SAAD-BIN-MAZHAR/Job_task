import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { WebhookPayloadDto } from './webhook-payload.dto';

/**
 * Unit tests for WebhookPayloadDto validation
 *
 * **Validates: Requirements 5.1, 5.2, 5.5, 18.1**
 */
describe('WebhookPayloadDto', () => {
  describe('Valid Payloads', () => {
    it('should pass validation with all required fields for BALANCE_UPDATE', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with ANNIVERSARY_ACCRUAL event type', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'ANNIVERSARY_ACCRUAL',
        employeeId: 'emp-123',
        availableHours: 160,
        accruedHours: 160,
        usedHours: 0,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with YEAR_START_RESET event type', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'YEAR_START_RESET',
        employeeId: 'emp-123',
        availableHours: 160,
        accruedHours: 160,
        usedHours: 0,
        timestamp: '2024-01-01T00:00:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with optional metadata', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
        metadata: {
          source: 'HCM_SYSTEM',
          batchId: 'batch-456',
        },
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with zero hours', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 0,
        accruedHours: 0,
        usedHours: 0,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Invalid eventType', () => {
    it('should fail validation when eventType is missing', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const eventTypeError = errors.find((e) => e.property === 'eventType');
      expect(eventTypeError).toBeDefined();
      expect(eventTypeError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail validation when eventType is invalid', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'INVALID_EVENT',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const eventTypeError = errors.find((e) => e.property === 'eventType');
      expect(eventTypeError).toBeDefined();
      expect(eventTypeError?.constraints).toHaveProperty('isEnum');
    });
  });

  describe('Invalid employeeId', () => {
    it('should fail validation when employeeId is missing', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const employeeIdError = errors.find((e) => e.property === 'employeeId');
      expect(employeeIdError).toBeDefined();
      expect(employeeIdError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail validation when employeeId is not a string', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 123,
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const employeeIdError = errors.find((e) => e.property === 'employeeId');
      expect(employeeIdError).toBeDefined();
      expect(employeeIdError?.constraints).toHaveProperty('isString');
    });
  });

  describe('Invalid Hours Fields', () => {
    it('should fail validation when availableHours is missing', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const availableHoursError = errors.find((e) => e.property === 'availableHours');
      expect(availableHoursError).toBeDefined();
    });

    it('should fail validation when availableHours is negative', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: -10,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const availableHoursError = errors.find((e) => e.property === 'availableHours');
      expect(availableHoursError).toBeDefined();
      expect(availableHoursError?.constraints).toHaveProperty('min');
    });

    it('should fail validation when accruedHours is negative', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: -5,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const accruedHoursError = errors.find((e) => e.property === 'accruedHours');
      expect(accruedHoursError).toBeDefined();
      expect(accruedHoursError?.constraints).toHaveProperty('min');
    });

    it('should fail validation when usedHours is negative', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: -20,
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const usedHoursError = errors.find((e) => e.property === 'usedHours');
      expect(usedHoursError).toBeDefined();
      expect(usedHoursError?.constraints).toHaveProperty('min');
    });

    it('should fail validation when hours fields are not numbers', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 'one-twenty',
        accruedHours: 'one-sixty',
        usedHours: 'forty',
        timestamp: '2024-01-15T10:30:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      const availableHoursError = errors.find((e) => e.property === 'availableHours');
      expect(availableHoursError).toBeDefined();
      expect(availableHoursError?.constraints).toHaveProperty('isNumber');

      const accruedHoursError = errors.find((e) => e.property === 'accruedHours');
      expect(accruedHoursError).toBeDefined();
      expect(accruedHoursError?.constraints).toHaveProperty('isNumber');

      const usedHoursError = errors.find((e) => e.property === 'usedHours');
      expect(usedHoursError).toBeDefined();
      expect(usedHoursError?.constraints).toHaveProperty('isNumber');
    });
  });

  describe('Invalid timestamp', () => {
    it('should fail validation when timestamp is missing', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const timestampError = errors.find((e) => e.property === 'timestamp');
      expect(timestampError).toBeDefined();
      expect(timestampError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail validation when timestamp is not ISO 8601 format', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '01/15/2024 10:30 AM',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const timestampError = errors.find((e) => e.property === 'timestamp');
      expect(timestampError).toBeDefined();
      expect(timestampError?.constraints).toHaveProperty('isDateString');
    });
  });

  describe('Invalid metadata', () => {
    it('should fail validation when metadata is not an object', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'BALANCE_UPDATE',
        employeeId: 'emp-123',
        availableHours: 120,
        accruedHours: 160,
        usedHours: 40,
        timestamp: '2024-01-15T10:30:00.000Z',
        metadata: 'not-an-object',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const metadataError = errors.find((e) => e.property === 'metadata');
      expect(metadataError).toBeDefined();
      expect(metadataError?.constraints).toHaveProperty('isObject');
    });
  });

  describe('Error Messages', () => {
    it('should provide descriptive error messages for all validation failures', async () => {
      const dto = plainToInstance(WebhookPayloadDto, {
        eventType: 'INVALID',
        employeeId: 123,
        availableHours: -10,
        accruedHours: 'invalid',
        usedHours: -5,
        timestamp: 'invalid-date',
        metadata: 'not-object',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      // Check that all error messages are descriptive
      errors.forEach((error) => {
        const messages = Object.values(error.constraints || {});
        messages.forEach((message) => {
          expect(message).toBeTruthy();
          expect(typeof message).toBe('string');
          expect(message.length).toBeGreaterThan(0);
        });
      });
    });
  });
});
