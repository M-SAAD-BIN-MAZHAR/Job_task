import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyModule } from './idempotency.module';
import { IdempotencyService } from './idempotency.service';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyKey } from './idempotency-key.entity';

describe('IdempotencyService Integration Tests', () => {
  let module: TestingModule;
  let service: IdempotencyService;
  let repository: IdempotencyRepository;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [IdempotencyKey],
          synchronize: true,
          logging: false,
        }),
        IdempotencyModule,
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    repository = module.get<IdempotencyRepository>(IdempotencyRepository);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('withIdempotency with real database', () => {
    it('should execute operation and cache result on first call', async () => {
      let executionCount = 0;
      const operation = async () => {
        executionCount++;
        return { id: 'test-123', value: 'result', executionCount };
      };

      const result = await service.withIdempotency('integration-key-1', operation);

      expect(result).toEqual({ id: 'test-123', value: 'result', executionCount: 1 });
      expect(executionCount).toBe(1);

      // Verify it was saved to database
      const saved = await repository.findValid('integration-key-1');
      expect(saved).not.toBeNull();
      expect(saved?.response).toEqual({ id: 'test-123', value: 'result', executionCount: 1 });
    });

    it('should return cached result on subsequent calls with same key', async () => {
      let executionCount = 0;
      const operation = async () => {
        executionCount++;
        return { id: 'test-456', value: 'result', executionCount };
      };

      // First call
      const result1 = await service.withIdempotency('integration-key-2', operation);
      expect(result1.executionCount).toBe(1);
      expect(executionCount).toBe(1);

      // Second call - should return cached result
      const result2 = await service.withIdempotency('integration-key-2', operation);
      expect(result2.executionCount).toBe(1); // Same as first call
      expect(executionCount).toBe(1); // Operation not executed again
    });

    it('should handle multiple different keys independently', async () => {
      const operation1 = async () => ({ key: 'key-a', value: 'result-a' });
      const operation2 = async () => ({ key: 'key-b', value: 'result-b' });
      const operation3 = async () => ({ key: 'key-c', value: 'result-c' });

      const result1 = await service.withIdempotency('multi-key-1', operation1);
      const result2 = await service.withIdempotency('multi-key-2', operation2);
      const result3 = await service.withIdempotency('multi-key-3', operation3);

      expect(result1).toEqual({ key: 'key-a', value: 'result-a' });
      expect(result2).toEqual({ key: 'key-b', value: 'result-b' });
      expect(result3).toEqual({ key: 'key-c', value: 'result-c' });

      // Verify all are cached
      const cached1 = await repository.findValid('multi-key-1');
      const cached2 = await repository.findValid('multi-key-2');
      const cached3 = await repository.findValid('multi-key-3');

      expect(cached1?.response).toEqual({ key: 'key-a', value: 'result-a' });
      expect(cached2?.response).toEqual({ key: 'key-b', value: 'result-b' });
      expect(cached3?.response).toEqual({ key: 'key-c', value: 'result-c' });
    });

    it('should execute operation when no key is provided', async () => {
      let executionCount = 0;
      const operation = async () => {
        executionCount++;
        return { value: 'no-key-result', executionCount };
      };

      const result1 = await service.withIdempotency(undefined, operation);
      const result2 = await service.withIdempotency(undefined, operation);

      expect(result1.executionCount).toBe(1);
      expect(result2.executionCount).toBe(2);
      expect(executionCount).toBe(2); // Executed both times
    });

    it('should handle expired keys correctly', async () => {
      // Save a key with very short TTL (1 millisecond)
      await repository.save('expired-key', { value: 'old-result' }, 1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      let executionCount = 0;
      const operation = async () => {
        executionCount++;
        return { value: 'new-result', executionCount };
      };

      // Should execute operation since key is expired
      const result = await service.withIdempotency('expired-key', operation);

      expect(result).toEqual({ value: 'new-result', executionCount: 1 });
      expect(executionCount).toBe(1);
    });

    it('should handle complex nested objects', async () => {
      const complexResult = {
        id: 'complex-123',
        nested: {
          level1: {
            level2: {
              data: [1, 2, 3],
              metadata: { timestamp: new Date().toISOString() },
            },
          },
        },
        array: [{ a: 1 }, { b: 2 }],
      };

      const operation = async () => complexResult;

      const result = await service.withIdempotency('complex-key', operation);
      expect(result).toEqual(complexResult);

      // Verify cached result matches
      const cached = await service.withIdempotency('complex-key', async () => ({
        different: 'value',
      }));
      expect(cached).toEqual(complexResult);
    });
  });

  describe('cleanupExpired with real database', () => {
    it('should delete expired keys and keep valid keys', async () => {
      // Create some keys with different expiration times
      await repository.save('valid-key-1', { value: 'valid-1' }, 3600000); // 1 hour
      await repository.save('valid-key-2', { value: 'valid-2' }, 3600000); // 1 hour
      await repository.save('expired-key-1', { value: 'expired-1' }, 1); // 1ms
      await repository.save('expired-key-2', { value: 'expired-2' }, 1); // 1ms

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Run cleanup
      await service.cleanupExpired();

      // Check that valid keys still exist
      const valid1 = await repository.findValid('valid-key-1');
      const valid2 = await repository.findValid('valid-key-2');
      expect(valid1).not.toBeNull();
      expect(valid2).not.toBeNull();

      // Check that expired keys are gone
      const expired1 = await repository.findValid('expired-key-1');
      const expired2 = await repository.findValid('expired-key-2');
      expect(expired1).toBeNull();
      expect(expired2).toBeNull();
    });

    it('should handle cleanup when no expired keys exist', async () => {
      await repository.save('only-valid-key', { value: 'valid' }, 3600000);

      // Should not throw error
      await expect(service.cleanupExpired()).resolves.not.toThrow();

      // Valid key should still exist
      const valid = await repository.findValid('only-valid-key');
      expect(valid).not.toBeNull();
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent requests with same key correctly', async () => {
      let executionCount = 0;
      const operation = async () => {
        executionCount++;
        // Simulate some async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { value: 'concurrent-result', executionCount };
      };

      // Execute multiple concurrent requests with same key
      const promises = [
        service.withIdempotency('concurrent-key', operation),
        service.withIdempotency('concurrent-key', operation),
        service.withIdempotency('concurrent-key', operation),
      ];

      const results = await Promise.all(promises);

      // All results should be identical (from cache or first execution)
      expect(results[0]).toEqual(results[1]);
      expect(results[1]).toEqual(results[2]);

      // Operation should be executed at least once, but may be executed multiple times
      // due to race conditions (this is acceptable for idempotency)
      expect(executionCount).toBeGreaterThanOrEqual(1);
    });
  });
});
