import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyKey } from './idempotency-key.entity';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let repository: jest.Mocked<IdempotencyRepository>;

  beforeEach(async () => {
    const mockRepository = {
      findValid: jest.fn(),
      save: jest.fn(),
      deleteExpired: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: IdempotencyRepository,
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    repository = module.get(IdempotencyRepository);
  });

  describe('withIdempotency', () => {
    it('should execute operation when no key is provided', async () => {
      const operation = jest.fn().mockResolvedValue('result');

      const result = await service.withIdempotency(undefined, operation);

      expect(result).toBe('result');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(repository.findValid).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should return cached response when key exists and is valid', async () => {
      const cachedResponse = { id: '123', status: 'DRAFT' };
      const existingKey: IdempotencyKey = {
        key: 'test-key',
        response: cachedResponse,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };
      repository.findValid.mockResolvedValue(existingKey);
      const operation = jest.fn().mockResolvedValue('new-result');

      const result = await service.withIdempotency('test-key', operation);

      expect(result).toEqual(cachedResponse);
      expect(repository.findValid).toHaveBeenCalledWith('test-key');
      expect(operation).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should execute operation and cache result when key does not exist', async () => {
      repository.findValid.mockResolvedValue(null);
      const operationResult = { id: '456', status: 'PENDING' };
      const operation = jest.fn().mockResolvedValue(operationResult);

      const result = await service.withIdempotency('new-key', operation);

      expect(result).toEqual(operationResult);
      expect(repository.findValid).toHaveBeenCalledWith('new-key');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith('new-key', operationResult);
    });

    it('should execute operation when existing key has expired', async () => {
      // Repository returns null for expired keys
      repository.findValid.mockResolvedValue(null);
      const operationResult = { id: '789', status: 'APPROVED' };
      const operation = jest.fn().mockResolvedValue(operationResult);

      const result = await service.withIdempotency('expired-key', operation);

      expect(result).toEqual(operationResult);
      expect(repository.findValid).toHaveBeenCalledWith('expired-key');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith('expired-key', operationResult);
    });

    it('should handle operation errors correctly', async () => {
      repository.findValid.mockResolvedValue(null);
      const error = new Error('Operation failed');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(service.withIdempotency('error-key', operation)).rejects.toThrow(
        'Operation failed',
      );

      expect(repository.findValid).toHaveBeenCalledWith('error-key');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('should prevent duplicate mutations with same key', async () => {
      let callCount = 0;
      const operation = jest.fn().mockImplementation(async () => {
        callCount++;
        return { id: 'unique-id', callNumber: callCount };
      });

      // First call - no cached result
      repository.findValid.mockResolvedValueOnce(null);
      const firstResult = await service.withIdempotency('duplicate-key', operation);

      // Second call - cached result exists
      repository.findValid.mockResolvedValueOnce({
        key: 'duplicate-key',
        response: firstResult,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      });
      const secondResult = await service.withIdempotency('duplicate-key', operation);

      expect(firstResult).toEqual({ id: 'unique-id', callNumber: 1 });
      expect(secondResult).toEqual({ id: 'unique-id', callNumber: 1 });
      expect(operation).toHaveBeenCalledTimes(1); // Operation only executed once
    });
  });

  describe('cleanupExpired', () => {
    it('should call repository deleteExpired method', async () => {
      repository.deleteExpired.mockResolvedValue(undefined);

      await service.cleanupExpired();

      expect(repository.deleteExpired).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup errors gracefully', async () => {
      const error = new Error('Database error');
      repository.deleteExpired.mockRejectedValue(error);

      await expect(service.cleanupExpired()).rejects.toThrow('Database error');
    });
  });
});
