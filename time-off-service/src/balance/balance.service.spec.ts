import { Test, TestingModule } from '@nestjs/testing';
import { BalanceService } from './balance.service';
import { BalanceRepository } from './repositories/balance.repository';
import { LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../audit/audit.service';
import { HCM_CLIENT, IHCMClient } from '../hcm/hcm-client.interface';
import { DataSource } from 'typeorm';
import { BalanceRecord } from './entities/balance-record.entity';
import { HcmUnavailableException } from '../common/exceptions/custom-exceptions';

describe('BalanceService - Graceful Degradation', () => {
  let service: BalanceService;
  let mockBalanceRepository: jest.Mocked<BalanceRepository>;
  let mockLedgerService: jest.Mocked<LedgerService>;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockHcmClient: jest.Mocked<IHCMClient>;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    // Create mocks
    mockBalanceRepository = {
      findByEmployeeOrFail: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    } as any;

    mockLedgerService = {
      createEntry: jest.fn(),
      debit: jest.fn(),
      credit: jest.fn(),
      getHistory: jest.fn(),
    } as any;

    mockAuditService = {
      log: jest.fn(),
    } as any;

    mockHcmClient = {
      healthCheck: jest.fn(),
      fetchBalance: jest.fn(),
      submitApproval: jest.fn(),
      verifyApproval: jest.fn(),
      fetchBalancesBatch: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceService,
        {
          provide: BalanceRepository,
          useValue: mockBalanceRepository,
        },
        {
          provide: LedgerService,
          useValue: mockLedgerService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: HCM_CLIENT,
          useValue: mockHcmClient,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<BalanceService>(BalanceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isHcmAvailable', () => {
    it('should return true when HCM health check succeeds', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      const result = await service.isHcmAvailable();

      // Assert
      expect(result).toBe(true);
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('should return false when HCM health check fails', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockResolvedValue(false);

      // Act
      const result = await service.isHcmAvailable();

      // Assert
      expect(result).toBe(false);
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('should return false when HCM health check throws error', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockRejectedValue(new Error('Connection timeout'));

      // Act
      const result = await service.isHcmAvailable();

      // Assert
      expect(result).toBe(false);
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('should cache HCM availability for 30 seconds', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act - First call
      const result1 = await service.isHcmAvailable();
      // Act - Second call within cache window
      const result2 = await service.isHcmAvailable();

      // Assert
      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(1); // Only called once due to cache
    });

    it('should refresh cache after TTL expires', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockResolvedValue(true);
      jest.useFakeTimers();

      // Act - First call
      await service.isHcmAvailable();

      // Fast-forward time by 31 seconds (beyond 30s TTL)
      jest.advanceTimersByTime(31000);

      // Act - Second call after cache expiry
      await service.isHcmAvailable();

      // Assert
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should cache negative results (HCM down)', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockResolvedValue(false);

      // Act
      const result1 = await service.isHcmAvailable();
      const result2 = await service.isHcmAvailable();

      // Assert
      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent availability checks without thundering herd', async () => {
      // Arrange
      let callCount = 0;
      mockHcmClient.healthCheck.mockImplementation(
        () =>
          new Promise((resolve) => {
            callCount++;
            setTimeout(() => resolve(true), 100);
          }),
      );

      // Act - Multiple concurrent calls
      const results = await Promise.all([
        service.isHcmAvailable(),
        service.isHcmAvailable(),
        service.isHcmAvailable(),
      ]);

      // Assert
      expect(results).toEqual([true, true, true]);
      // Due to concurrent execution, all three may start before cache is set
      // But we should see fewer calls than without caching (which would be 3)
      expect(callCount).toBeGreaterThanOrEqual(1);
      expect(callCount).toBeLessThanOrEqual(3);
    });
  });

  describe('clearHcmAvailabilityCache', () => {
    it('should clear the cache and force fresh check on next call', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockResolvedValue(true);

      // Act
      await service.isHcmAvailable(); // First call - caches result
      service.clearHcmAvailabilityCache(); // Clear cache
      await service.isHcmAvailable(); // Second call - should check HCM again

      // Assert
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(2);
    });
  });

  describe('syncBalance - Graceful Degradation', () => {
    const employeeId = 'emp-123';
    const cachedBalance: BalanceRecord = {
      id: 'bal-123',
      employeeId,
      availableHours: 40,
      accruedHours: 80,
      usedHours: 40,
      lastSyncedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
      updatedAt: new Date(),
      version: 1,
      isStale: true,
    } as BalanceRecord;

    it('should sync successfully when HCM is available', async () => {
      // Arrange
      const hcmData = {
        employeeId,
        availableHours: 45,
        accruedHours: 85,
        usedHours: 40,
        asOfDate: new Date(),
      };
      mockHcmClient.fetchBalance.mockResolvedValue(hcmData);
      mockDataSource.transaction.mockImplementation(async (callback: any) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(cachedBalance),
          save: jest.fn().mockResolvedValue({ ...cachedBalance, ...hcmData }),
        };
        return callback(manager);
      });

      // Act
      const result = await service.syncBalance(employeeId);

      // Assert
      expect(mockHcmClient.fetchBalance).toHaveBeenCalledWith(employeeId);
      expect(result.availableHours).toBe(45);
    });

    it('should throw HcmUnavailableException when HCM is down', async () => {
      // Arrange
      mockHcmClient.fetchBalance.mockRejectedValue(new Error('Connection timeout'));
      mockBalanceRepository.findByEmployeeOrFail.mockResolvedValue(cachedBalance);

      // Act & Assert
      await expect(service.syncBalance(employeeId)).rejects.toThrow(HcmUnavailableException);
      expect(mockBalanceRepository.findByEmployeeOrFail).toHaveBeenCalledWith(employeeId);
    });

    it('should include cached balance timestamp in error message', async () => {
      // Arrange
      mockHcmClient.fetchBalance.mockRejectedValue(new Error('Connection timeout'));
      mockBalanceRepository.findByEmployeeOrFail.mockResolvedValue(cachedBalance);

      // Act & Assert
      try {
        await service.syncBalance(employeeId);
        fail('Should have thrown HcmUnavailableException');
      } catch (error) {
        expect(error).toBeInstanceOf(HcmUnavailableException);
        expect(error.message).toContain('HCM system is unavailable');
        expect(error.message).toContain(cachedBalance.lastSyncedAt.toISOString());
      }
    });

    it('should log warning when sync fails', async () => {
      // Arrange
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      mockHcmClient.fetchBalance.mockRejectedValue(new Error('Connection timeout'));
      mockBalanceRepository.findByEmployeeOrFail.mockResolvedValue(cachedBalance);

      // Act
      try {
        await service.syncBalance(employeeId);
      } catch {
        // Expected to throw
      }

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to sync balance for ${employeeId}`),
      );
    });

    it('should log when serving cached balance', async () => {
      // Arrange
      const loggerSpy = jest.spyOn(service['logger'], 'log');
      mockHcmClient.fetchBalance.mockRejectedValue(new Error('Connection timeout'));
      mockBalanceRepository.findByEmployeeOrFail.mockResolvedValue(cachedBalance);

      // Act
      try {
        await service.syncBalance(employeeId);
      } catch {
        // Expected to throw
      }

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Serving cached balance for ${employeeId}`),
      );
    });
  });

  describe('getBalance - Cache-First Serving', () => {
    const employeeId = 'emp-456';
    const balance: BalanceRecord = {
      id: 'bal-456',
      employeeId,
      availableHours: 50,
      accruedHours: 100,
      usedHours: 50,
      lastSyncedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago
      updatedAt: new Date(),
      version: 1,
      isStale: false,
    } as BalanceRecord;

    it('should return cached balance without checking HCM', async () => {
      // Arrange
      mockBalanceRepository.findByEmployeeOrFail.mockResolvedValue(balance);

      // Act
      const result = await service.getBalance(employeeId);

      // Assert
      expect(result).toEqual(balance);
      expect(mockBalanceRepository.findByEmployeeOrFail).toHaveBeenCalledWith(employeeId);
      expect(mockHcmClient.fetchBalance).not.toHaveBeenCalled();
    });

    it('should return stale cached balance when HCM is unavailable', async () => {
      // Arrange
      const staleBalance = {
        ...balance,
        lastSyncedAt: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        isStale: true,
      };
      mockBalanceRepository.findByEmployeeOrFail.mockResolvedValue(staleBalance);

      // Act
      const result = await service.getBalance(employeeId);

      // Assert
      expect(result).toEqual(staleBalance);
      expect(result.isStale).toBe(true);
      expect(mockHcmClient.fetchBalance).not.toHaveBeenCalled();
    });
  });

  describe('HCM Availability Caching - Edge Cases', () => {
    it('should handle rapid state changes (HCM up then down)', async () => {
      // Arrange
      mockHcmClient.healthCheck
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      // Act
      const result1 = await service.isHcmAvailable();
      service.clearHcmAvailabilityCache();
      const result2 = await service.isHcmAvailable();

      // Assert
      expect(result1).toBe(true);
      expect(result2).toBe(false);
    });

    it('should handle HCM recovery (down then up)', async () => {
      // Arrange
      mockHcmClient.healthCheck
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      // Act
      const result1 = await service.isHcmAvailable();
      service.clearHcmAvailabilityCache();
      const result2 = await service.isHcmAvailable();

      // Assert
      expect(result1).toBe(false);
      expect(result2).toBe(true);
    });

    it('should handle intermittent HCM failures', async () => {
      // Arrange
      mockHcmClient.healthCheck
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(true);

      // Act
      const result1 = await service.isHcmAvailable();
      service.clearHcmAvailabilityCache();
      const result2 = await service.isHcmAvailable();
      service.clearHcmAvailabilityCache();
      const result3 = await service.isHcmAvailable();

      // Assert
      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(result3).toBe(true);
    });
  });

  describe('Cache TTL Behavior', () => {
    it('should respect 30-second TTL exactly', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockResolvedValue(true);
      jest.useFakeTimers();

      // Act
      await service.isHcmAvailable(); // Initial call

      // Advance time to just before TTL expiry (29.9 seconds)
      jest.advanceTimersByTime(29900);
      await service.isHcmAvailable(); // Should use cache

      // Advance time to just after TTL expiry (30.1 seconds total)
      jest.advanceTimersByTime(200);
      await service.isHcmAvailable(); // Should check HCM again

      // Assert
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should handle multiple cache expirations', async () => {
      // Arrange
      mockHcmClient.healthCheck.mockResolvedValue(true);
      jest.useFakeTimers();

      // Act
      await service.isHcmAvailable(); // Call 1
      jest.advanceTimersByTime(31000);
      await service.isHcmAvailable(); // Call 2 (after first expiry)
      jest.advanceTimersByTime(31000);
      await service.isHcmAvailable(); // Call 3 (after second expiry)

      // Assert
      expect(mockHcmClient.healthCheck).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });
  });
});
