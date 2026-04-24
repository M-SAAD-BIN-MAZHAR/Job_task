import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { IdempotencyRepository } from './idempotency.repository';
import { IdempotencyKey } from './idempotency-key.entity';

describe('IdempotencyRepository', () => {
  let repository: IdempotencyRepository;
  let typeormRepo: jest.Mocked<Repository<IdempotencyKey>>;

  beforeEach(async () => {
    const mockTypeormRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyRepository,
        {
          provide: getRepositoryToken(IdempotencyKey),
          useValue: mockTypeormRepo,
        },
      ],
    }).compile();

    repository = module.get<IdempotencyRepository>(IdempotencyRepository);
    typeormRepo = module.get(getRepositoryToken(IdempotencyKey));
  });

  describe('findValid', () => {
    it('should return idempotency key when it exists and is not expired', async () => {
      const validKey: IdempotencyKey = {
        key: 'test-key',
        response: { data: 'test' },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      };
      typeormRepo.findOne.mockResolvedValue(validKey);

      const result = await repository.findValid('test-key');

      expect(result).toEqual(validKey);
      expect(typeormRepo.findOne).toHaveBeenCalledWith({
        where: { key: 'test-key' },
      });
    });

    it('should return null when key does not exist', async () => {
      typeormRepo.findOne.mockResolvedValue(null);

      const result = await repository.findValid('non-existent-key');

      expect(result).toBeNull();
      expect(typeormRepo.findOne).toHaveBeenCalledWith({
        where: { key: 'non-existent-key' },
      });
    });

    it('should return null when key exists but has expired', async () => {
      const expiredKey: IdempotencyKey = {
        key: 'expired-key',
        response: { data: 'test' },
        createdAt: new Date(Date.now() - 86400000), // 24 hours ago
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago (expired)
      };
      typeormRepo.findOne.mockResolvedValue(expiredKey);

      const result = await repository.findValid('expired-key');

      expect(result).toBeNull();
    });

    it('should return null when key expires exactly at current time', async () => {
      const now = new Date();
      const expiredKey: IdempotencyKey = {
        key: 'exact-expiry-key',
        response: { data: 'test' },
        createdAt: new Date(now.getTime() - 86400000),
        expiresAt: now,
      };
      typeormRepo.findOne.mockResolvedValue(expiredKey);

      const result = await repository.findValid('exact-expiry-key');

      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('should save idempotency key with default 24-hour TTL', async () => {
      const key = 'save-key';
      const response = { id: '123', status: 'DRAFT' };
      const createdEntity = {
        key,
        response,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      };
      typeormRepo.create.mockReturnValue(createdEntity as IdempotencyKey);
      typeormRepo.save.mockResolvedValue(createdEntity as IdempotencyKey);

      const result = await repository.save(key, response);

      expect(typeormRepo.create).toHaveBeenCalledWith({
        key,
        response,
        expiresAt: expect.any(Date),
      });
      expect(typeormRepo.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toEqual(createdEntity);
    });

    it('should save idempotency key with custom TTL', async () => {
      const key = 'custom-ttl-key';
      const response = { id: '456', status: 'PENDING' };
      const customTtl = 3600000; // 1 hour
      const createdEntity = {
        key,
        response,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + customTtl),
      };
      typeormRepo.create.mockReturnValue(createdEntity as IdempotencyKey);
      typeormRepo.save.mockResolvedValue(createdEntity as IdempotencyKey);

      const result = await repository.save(key, response, customTtl);

      expect(typeormRepo.create).toHaveBeenCalledWith({
        key,
        response,
        expiresAt: expect.any(Date),
      });
      const createCall = typeormRepo.create.mock.calls[0][0];
      const expiresAt = createCall.expiresAt as Date;
      const expectedExpiry = Date.now() + customTtl;
      // Allow 1 second tolerance for test execution time
      expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(1000);
    });

    it('should handle complex response objects', async () => {
      const key = 'complex-key';
      const response = {
        id: '789',
        status: 'APPROVED',
        nested: { data: [1, 2, 3] },
        timestamp: new Date().toISOString(),
      };
      const createdEntity = {
        key,
        response,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      };
      typeormRepo.create.mockReturnValue(createdEntity as IdempotencyKey);
      typeormRepo.save.mockResolvedValue(createdEntity as IdempotencyKey);

      const result = await repository.save(key, response);

      expect(result.response).toEqual(response);
    });
  });

  describe('deleteExpired', () => {
    it('should delete all expired idempotency keys', async () => {
      typeormRepo.delete.mockResolvedValue({ affected: 5, raw: [] });

      await repository.deleteExpired();

      expect(typeormRepo.delete).toHaveBeenCalledWith({
        expiresAt: LessThan(expect.any(Date)),
      });
    });

    it('should handle case when no expired keys exist', async () => {
      typeormRepo.delete.mockResolvedValue({ affected: 0, raw: [] });

      await repository.deleteExpired();

      expect(typeormRepo.delete).toHaveBeenCalledWith({
        expiresAt: LessThan(expect.any(Date)),
      });
    });

    it('should use current time for expiration check', async () => {
      const beforeCall = Date.now();
      await repository.deleteExpired();
      const afterCall = Date.now();

      const deleteCall = typeormRepo.delete.mock.calls[0][0] as any;
      // The LessThan operator wraps the date value
      const expiresAtCondition = deleteCall.expiresAt;
      const lessThanTime = expiresAtCondition._value.getTime();

      expect(lessThanTime).toBeGreaterThanOrEqual(beforeCall);
      expect(lessThanTime).toBeLessThanOrEqual(afterCall);
    });
  });
});
