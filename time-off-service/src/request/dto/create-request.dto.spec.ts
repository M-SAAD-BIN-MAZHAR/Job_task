import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRequestDto } from './create-request.dto';

/**
 * Unit tests for CreateRequestDto validation
 *
 * **Validates: Requirements 18.1, 18.5, 18.7**
 */
describe('CreateRequestDto', () => {
  describe('Valid Payloads', () => {
    it('should pass validation with all required fields', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with optional idempotencyKey', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
        idempotencyKey: 'unique-key-123',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation when startDate equals endDate', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-15T00:00:00.000Z',
        hoursRequested: 8,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('should pass validation with minimum hoursRequested (0.01)', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-15T00:00:00.000Z',
        hoursRequested: 0.01,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Invalid employeeId', () => {
    it('should fail validation when employeeId is missing', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('employeeId');
      expect(errors[0].constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail validation when employeeId is not a string', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: 12345,
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const employeeIdError = errors.find((e) => e.property === 'employeeId');
      expect(employeeIdError).toBeDefined();
      expect(employeeIdError?.constraints).toHaveProperty('isString');
    });
  });

  describe('Invalid managerId', () => {
    it('should fail validation when managerId is missing', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const managerIdError = errors.find((e) => e.property === 'managerId');
      expect(managerIdError).toBeDefined();
      expect(managerIdError?.constraints).toHaveProperty('isNotEmpty');
    });

    it('should fail validation when managerId is not a string', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: 12345,
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const managerIdError = errors.find((e) => e.property === 'managerId');
      expect(managerIdError).toBeDefined();
      expect(managerIdError?.constraints).toHaveProperty('isString');
    });
  });

  describe('Invalid Date Fields', () => {
    it('should fail validation when startDate is missing', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const startDateError = errors.find((e) => e.property === 'startDate');
      expect(startDateError).toBeDefined();
    });

    it('should fail validation when endDate is missing', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const endDateError = errors.find((e) => e.property === 'endDate');
      expect(endDateError).toBeDefined();
    });

    it('should fail validation when startDate is not ISO 8601 format', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '01/15/2024',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const startDateError = errors.find((e) => e.property === 'startDate');
      expect(startDateError).toBeDefined();
      expect(startDateError?.constraints).toHaveProperty('isDateString');
    });

    it('should fail validation when startDate is after endDate', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-25T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 40,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const startDateError = errors.find((e) => e.property === 'startDate');
      expect(startDateError).toBeDefined();
      expect(startDateError?.constraints).toHaveProperty('isDateRangeValid');
    });
  });

  describe('Invalid hoursRequested', () => {
    it('should fail validation when hoursRequested is missing', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const hoursError = errors.find((e) => e.property === 'hoursRequested');
      expect(hoursError).toBeDefined();
    });

    it('should fail validation when hoursRequested is zero', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 0,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const hoursError = errors.find((e) => e.property === 'hoursRequested');
      expect(hoursError).toBeDefined();
      expect(hoursError?.constraints).toHaveProperty('min');
    });

    it('should fail validation when hoursRequested is negative', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: -10,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const hoursError = errors.find((e) => e.property === 'hoursRequested');
      expect(hoursError).toBeDefined();
      expect(hoursError?.constraints).toHaveProperty('min');
    });

    it('should fail validation when hoursRequested is not a number', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '123e4567-e89b-12d3-a456-426614174000',
        managerId: '123e4567-e89b-12d3-a456-426614174001',
        startDate: '2024-01-15T00:00:00.000Z',
        endDate: '2024-01-20T00:00:00.000Z',
        hoursRequested: 'forty',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const hoursError = errors.find((e) => e.property === 'hoursRequested');
      expect(hoursError).toBeDefined();
      expect(hoursError?.constraints).toHaveProperty('isNumber');
    });
  });

  describe('Error Messages', () => {
    it('should provide descriptive error messages', async () => {
      const dto = plainToInstance(CreateRequestDto, {
        employeeId: '',
        managerId: '',
        startDate: 'invalid',
        endDate: 'invalid',
        hoursRequested: -1,
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);

      // Check that error messages are descriptive
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
