import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { BalanceController } from './balance.controller';
import { BalanceService } from './balance.service';
import { SyncService } from '../sync/sync.service';
import { BalanceRecord } from './entities/balance-record.entity';
import { LedgerEntry } from '../ledger/entities/ledger-entry.entity';

describe('BalanceController', () => {
  let controller: BalanceController;
  let balanceService: jest.Mocked<BalanceService>;
  let syncService: jest.Mocked<SyncService>;

  const createMockBalance = (overrides?: Partial<BalanceRecord>): BalanceRecord => {
    return {
      id: '1',
      employeeId: 'emp-123',
      availableHours: 100,
      accruedHours: 120,
      usedHours: 20,
      lastSyncedAt: new Date('2024-01-15T10:00:00Z'),
      updatedAt: new Date('2024-01-15T10:00:00Z'),
      version: 1,
      ...overrides,
    } as BalanceRecord;
  };

  const createMockLedgerEntry = (overrides?: Partial<LedgerEntry>): LedgerEntry => {
    return {
      id: 'ledger-1',
      employeeId: 'emp-123',
      operation: 'DEBIT',
      amount: 8,
      source: 'APPROVAL',
      requestId: 'req-1',
      description: 'Deducted 8h for request req-1',
      createdAt: new Date('2024-01-15T10:00:00Z'),
      metadata: {},
      ...overrides,
    } as LedgerEntry;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BalanceController],
      providers: [
        {
          provide: BalanceService,
          useValue: {
            getBalance: jest.fn(),
            syncBalance: jest.fn(),
            getLedgerHistory: jest.fn(),
          },
        },
        {
          provide: SyncService,
          useValue: {
            syncEmployee: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BalanceController>(BalanceController);
    balanceService = module.get(BalanceService);
    syncService = module.get(SyncService);
  });

  describe('getBalance', () => {
    it('should return balance for employee accessing their own data', async () => {
      const mockBalance = createMockBalance();
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.getBalance('emp-123', mockRequest);

      expect(result).toEqual({
        employeeId: 'emp-123',
        availableHours: 100,
        accruedHours: 120,
        usedHours: 20,
        lastSyncedAt: '2024-01-15T10:00:00.000Z',
        isStale: true, // More than 5 minutes old
        staleSince: '2024-01-15T10:00:00.000Z',
      });

      expect(balanceService.getBalance).toHaveBeenCalledWith('emp-123');
    });

    it('should return balance for manager accessing any employee data', async () => {
      const mockBalance = createMockBalance();
      const mockRequest = {
        user: { sub: 'manager-1', role: 'MANAGER' },
      };

      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.getBalance('emp-123', mockRequest);

      expect(result.employeeId).toBe('emp-123');
      expect(balanceService.getBalance).toHaveBeenCalledWith('emp-123');
    });

    it('should return balance for admin accessing any employee data', async () => {
      const mockBalance = createMockBalance();
      const mockRequest = {
        user: { sub: 'admin-1', role: 'ADMIN' },
      };

      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.getBalance('emp-123', mockRequest);

      expect(result.employeeId).toBe('emp-123');
      expect(balanceService.getBalance).toHaveBeenCalledWith('emp-123');
    });

    it('should throw ForbiddenException when employee tries to access another employee balance', async () => {
      const mockRequest = {
        user: { sub: 'emp-456', role: 'EMPLOYEE' },
      };

      await expect(controller.getBalance('emp-123', mockRequest)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.getBalance('emp-123', mockRequest)).rejects.toThrow(
        'Employees can only access their own balance',
      );

      expect(balanceService.getBalance).not.toHaveBeenCalled();
    });

    it('should mark balance as not stale when recently synced', async () => {
      const recentDate = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      const mockBalance = createMockBalance({ lastSyncedAt: recentDate });
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.getBalance('emp-123', mockRequest);

      expect(result.isStale).toBe(false);
      expect(result.staleSince).toBeUndefined();
    });

    it('should mark balance as stale when last synced more than 5 minutes ago', async () => {
      const oldDate = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const mockBalance = createMockBalance({ lastSyncedAt: oldDate });
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.getBalance('emp-123', mockRequest);

      expect(result.isStale).toBe(true);
      expect(result.staleSince).toBe(oldDate.toISOString());
    });
  });

  describe('syncBalance', () => {
    it('should sync balance for manager', async () => {
      const mockBalance = createMockBalance({ lastSyncedAt: new Date() });
      const mockSyncResult = {
        employeeId: 'emp-123',
        driftDetected: false,
        localBalance: 100,
        hcmBalance: 100,
        corrected: false,
      };
      const mockRequest = {
        user: { sub: 'manager-1', role: 'MANAGER' },
      };

      syncService.syncEmployee.mockResolvedValue(mockSyncResult);
      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.syncBalance('emp-123', mockRequest);

      expect(result.employeeId).toBe('emp-123');
      expect(result.availableHours).toBe(100);
      expect(syncService.syncEmployee).toHaveBeenCalledWith('emp-123');
      expect(balanceService.getBalance).toHaveBeenCalledWith('emp-123');
    });

    it('should sync balance for admin', async () => {
      const mockBalance = createMockBalance({ lastSyncedAt: new Date() });
      const mockSyncResult = {
        employeeId: 'emp-123',
        driftDetected: true,
        localBalance: 100,
        hcmBalance: 105,
        difference: 5,
        corrected: true,
      };
      const mockRequest = {
        user: { sub: 'admin-1', role: 'ADMIN' },
      };

      syncService.syncEmployee.mockResolvedValue(mockSyncResult);
      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.syncBalance('emp-123', mockRequest);

      expect(result.employeeId).toBe('emp-123');
      expect(syncService.syncEmployee).toHaveBeenCalledWith('emp-123');
    });

    it('should return updated balance after sync with drift correction', async () => {
      const updatedBalance = createMockBalance({
        availableHours: 105,
        lastSyncedAt: new Date(),
      });
      const mockSyncResult = {
        employeeId: 'emp-123',
        driftDetected: true,
        localBalance: 100,
        hcmBalance: 105,
        difference: 5,
        corrected: true,
      };
      const mockRequest = {
        user: { sub: 'manager-1', role: 'MANAGER' },
      };

      syncService.syncEmployee.mockResolvedValue(mockSyncResult);
      balanceService.getBalance.mockResolvedValue(updatedBalance);

      const result = await controller.syncBalance('emp-123', mockRequest);

      expect(result.availableHours).toBe(105);
      expect(result.isStale).toBe(false);
    });
  });

  describe('getLedgerHistory', () => {
    it('should return ledger history for employee accessing their own data', async () => {
      const mockLedgerEntries = [
        createMockLedgerEntry(),
        createMockLedgerEntry({
          id: 'ledger-2',
          operation: 'CREDIT',
          amount: 40,
          source: 'HCM_SYNC',
        }),
      ];
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      balanceService.getLedgerHistory.mockResolvedValue(mockLedgerEntries);

      const result = await controller.getLedgerHistory('emp-123', {}, mockRequest);

      expect(result).toEqual(mockLedgerEntries);
      expect(result).toHaveLength(2);
      expect(balanceService.getLedgerHistory).toHaveBeenCalledWith('emp-123');
    });

    it('should return ledger history for manager accessing any employee data', async () => {
      const mockLedgerEntries = [createMockLedgerEntry()];
      const mockRequest = {
        user: { sub: 'manager-1', role: 'MANAGER' },
      };

      balanceService.getLedgerHistory.mockResolvedValue(mockLedgerEntries);

      const result = await controller.getLedgerHistory('emp-123', {}, mockRequest);

      expect(result).toEqual(mockLedgerEntries);
      expect(balanceService.getLedgerHistory).toHaveBeenCalledWith('emp-123');
    });

    it('should return ledger history for admin accessing any employee data', async () => {
      const mockLedgerEntries = [createMockLedgerEntry()];
      const mockRequest = {
        user: { sub: 'admin-1', role: 'ADMIN' },
      };

      balanceService.getLedgerHistory.mockResolvedValue(mockLedgerEntries);

      const result = await controller.getLedgerHistory('emp-123', {}, mockRequest);

      expect(result).toEqual(mockLedgerEntries);
      expect(balanceService.getLedgerHistory).toHaveBeenCalledWith('emp-123');
    });

    it('should throw ForbiddenException when employee tries to access another employee ledger', async () => {
      const mockRequest = {
        user: { sub: 'emp-456', role: 'EMPLOYEE' },
      };

      await expect(controller.getLedgerHistory('emp-123', {}, mockRequest)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.getLedgerHistory('emp-123', {}, mockRequest)).rejects.toThrow(
        'Employees can only access their own ledger history',
      );

      expect(balanceService.getLedgerHistory).not.toHaveBeenCalled();
    });

    it('should handle query filters for ledger history', async () => {
      const mockLedgerEntries = [createMockLedgerEntry()];
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };
      const queryDto = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        operation: 'DEBIT' as const,
        source: 'APPROVAL' as const,
      };

      balanceService.getLedgerHistory.mockResolvedValue(mockLedgerEntries);

      const result = await controller.getLedgerHistory('emp-123', queryDto, mockRequest);

      expect(result).toEqual(mockLedgerEntries);
      expect(balanceService.getLedgerHistory).toHaveBeenCalledWith('emp-123');
    });

    it('should return empty array when no ledger entries exist', async () => {
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      balanceService.getLedgerHistory.mockResolvedValue([]);

      const result = await controller.getLedgerHistory('emp-123', {}, mockRequest);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('access control', () => {
    it('should enforce EMPLOYEE role can only access own balance', async () => {
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      await expect(controller.getBalance('emp-456', mockRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should enforce EMPLOYEE role can only access own ledger', async () => {
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      await expect(controller.getLedgerHistory('emp-456', {}, mockRequest)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow MANAGER to access any employee balance', async () => {
      const mockBalance = createMockBalance({ employeeId: 'emp-456' });
      const mockRequest = {
        user: { sub: 'manager-1', role: 'MANAGER' },
      };

      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.getBalance('emp-456', mockRequest);

      expect(result.employeeId).toBe('emp-456');
    });

    it('should allow ADMIN to access any employee balance', async () => {
      const mockBalance = createMockBalance({ employeeId: 'emp-456' });
      const mockRequest = {
        user: { sub: 'admin-1', role: 'ADMIN' },
      };

      balanceService.getBalance.mockResolvedValue(mockBalance);

      const result = await controller.getBalance('emp-456', mockRequest);

      expect(result.employeeId).toBe('emp-456');
    });
  });

  describe('error handling', () => {
    it('should propagate errors from BalanceService', async () => {
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      balanceService.getBalance.mockRejectedValue(new Error('Balance not found'));

      await expect(controller.getBalance('emp-123', mockRequest)).rejects.toThrow(
        'Balance not found',
      );
    });

    it('should propagate errors from SyncService', async () => {
      const mockRequest = {
        user: { sub: 'manager-1', role: 'MANAGER' },
      };

      syncService.syncEmployee.mockRejectedValue(new Error('HCM unavailable'));

      await expect(controller.syncBalance('emp-123', mockRequest)).rejects.toThrow(
        'HCM unavailable',
      );
    });

    it('should propagate errors from getLedgerHistory', async () => {
      const mockRequest = {
        user: { sub: 'emp-123', role: 'EMPLOYEE' },
      };

      balanceService.getLedgerHistory.mockRejectedValue(new Error('Database error'));

      await expect(controller.getLedgerHistory('emp-123', {}, mockRequest)).rejects.toThrow(
        'Database error',
      );
    });
  });
});
