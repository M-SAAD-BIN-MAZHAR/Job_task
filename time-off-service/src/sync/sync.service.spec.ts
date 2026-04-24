import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { SyncService } from './sync.service';
import { ReconciliationService } from './reconciliation.service';
import { BalanceService } from '../balance/balance.service';
import { LedgerService } from '../ledger/ledger.service';
import { SyncRepository } from './repositories/sync.repository';
import { HCM_CLIENT, IHCMClient } from '../hcm/hcm-client.interface';
import { BalanceRecord } from '../balance/entities/balance-record.entity';
import { SyncCheckpoint } from './entities/sync-checkpoint.entity';

describe('SyncService', () => {
  let service: SyncService;
  let reconciliationService: jest.Mocked<ReconciliationService>;
  let balanceService: jest.Mocked<BalanceService>;
  let ledgerService: jest.Mocked<LedgerService>;
  let syncRepository: jest.Mocked<SyncRepository>;
  let hcmClient: jest.Mocked<IHCMClient>;
  let dataSource: jest.Mocked<DataSource>;

  const createMockBalance = (overrides?: Partial<BalanceRecord>): BalanceRecord => {
    const balance = {
      id: '1',
      employeeId: 'emp-1',
      availableHours: 100,
      accruedHours: 120,
      usedHours: 20,
      lastSyncedAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      version: 1,
      ...overrides,
    } as BalanceRecord;

    // Mock the isStale getter
    Object.defineProperty(balance, 'isStale', {
      get: () => false,
      configurable: true,
    });

    return balance;
  };

  const mockHcmBalance = {
    employeeId: 'emp-1',
    availableHours: 100,
    accruedHours: 120,
    usedHours: 20,
    asOfDate: new Date('2024-01-15'),
  };

  beforeEach(async () => {
    const mockManager = {
      update: jest.fn().mockResolvedValue({}),
    } as unknown as EntityManager;

    const mockDataSource = {
      transaction: jest.fn((cb) => cb(mockManager)),
      manager: mockManager,
    } as unknown as DataSource;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        {
          provide: ReconciliationService,
          useValue: {
            runBatchReconciliation: jest.fn(),
          },
        },
        {
          provide: BalanceService,
          useValue: {
            getBalance: jest.fn(),
          },
        },
        {
          provide: LedgerService,
          useValue: {
            createEntry: jest.fn(),
          },
        },
        {
          provide: SyncRepository,
          useValue: {
            findLatest: jest.fn(),
          },
        },
        {
          provide: HCM_CLIENT,
          useValue: {
            fetchBalance: jest.fn(),
            fetchBalancesBatch: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
    reconciliationService = module.get(ReconciliationService);
    balanceService = module.get(BalanceService);
    ledgerService = module.get(LedgerService);
    syncRepository = module.get(SyncRepository);
    hcmClient = module.get(HCM_CLIENT);
    dataSource = module.get(DataSource);
  });

  describe('runBatchReconciliation', () => {
    it('should delegate to ReconciliationService', async () => {
      const mockCheckpoint: SyncCheckpoint = {
        id: 'checkpoint-1',
        startedAt: new Date(),
        completedAt: new Date(),
        totalEmployees: 100,
        processedEmployees: 100,
        driftDetectedCount: 5,
        status: 'COMPLETED',
        driftDetails: [],
      };

      reconciliationService.runBatchReconciliation.mockResolvedValue(mockCheckpoint);

      const result = await service.runBatchReconciliation();

      expect(result).toEqual(mockCheckpoint);
      expect(reconciliationService.runBatchReconciliation).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncEmployee', () => {
    it('should sync employee without drift', async () => {
      const mockBalance = createMockBalance();
      balanceService.getBalance.mockResolvedValue(mockBalance);
      hcmClient.fetchBalance.mockResolvedValue(mockHcmBalance);

      const result = await service.syncEmployee('emp-1');

      expect(result).toEqual({
        employeeId: 'emp-1',
        driftDetected: false,
        localBalance: 100,
        hcmBalance: 100,
        corrected: false,
      });

      expect(balanceService.getBalance).toHaveBeenCalledWith('emp-1');
      expect(hcmClient.fetchBalance).toHaveBeenCalledWith('emp-1');
      expect(ledgerService.createEntry).not.toHaveBeenCalled();
      expect(dataSource.manager.update).toHaveBeenCalledWith(
        BalanceRecord,
        { employeeId: 'emp-1' },
        { lastSyncedAt: expect.any(Date) },
      );
    });

    it('should detect and correct positive drift', async () => {
      const mockBalance = createMockBalance();
      const driftedHcmBalance = { ...mockHcmBalance, availableHours: 105 };

      balanceService.getBalance.mockResolvedValue(mockBalance);
      hcmClient.fetchBalance.mockResolvedValue(driftedHcmBalance);

      const result = await service.syncEmployee('emp-1');

      expect(result).toEqual({
        employeeId: 'emp-1',
        driftDetected: true,
        localBalance: 100,
        hcmBalance: 105,
        difference: 5,
        corrected: true,
      });

      expect(ledgerService.createEntry).toHaveBeenCalledWith({
        employeeId: 'emp-1',
        operation: 'CREDIT',
        amount: 5,
        source: 'RECONCILIATION',
        description: 'Drift correction: 100 → 105',
      });
    });

    it('should detect and correct negative drift', async () => {
      const mockBalance = createMockBalance();
      const driftedHcmBalance = { ...mockHcmBalance, availableHours: 95 };

      balanceService.getBalance.mockResolvedValue(mockBalance);
      hcmClient.fetchBalance.mockResolvedValue(driftedHcmBalance);

      const result = await service.syncEmployee('emp-1');

      expect(result).toEqual({
        employeeId: 'emp-1',
        driftDetected: true,
        localBalance: 100,
        hcmBalance: 95,
        difference: -5,
        corrected: true,
      });

      expect(ledgerService.createEntry).toHaveBeenCalledWith({
        employeeId: 'emp-1',
        operation: 'DEBIT',
        amount: 5,
        source: 'RECONCILIATION',
        description: 'Drift correction: 100 → 95',
      });
    });

    it('should not correct drift below threshold', async () => {
      const mockBalance = createMockBalance();
      const minorDriftBalance = { ...mockHcmBalance, availableHours: 100.05 };

      balanceService.getBalance.mockResolvedValue(mockBalance);
      hcmClient.fetchBalance.mockResolvedValue(minorDriftBalance);

      const result = await service.syncEmployee('emp-1');

      expect(result.driftDetected).toBe(false);
      expect(ledgerService.createEntry).not.toHaveBeenCalled();
    });
  });

  describe('detectDrift', () => {
    it('should detect drift without correcting', async () => {
      const mockBalance = createMockBalance();
      const driftedHcmBalance = { ...mockHcmBalance, availableHours: 110 };

      balanceService.getBalance.mockResolvedValue(mockBalance);
      hcmClient.fetchBalance.mockResolvedValue(driftedHcmBalance);

      const result = await service.detectDrift('emp-1');

      expect(result).toEqual({
        hasDrift: true,
        localBalance: 100,
        hcmBalance: 110,
        difference: 10,
      });

      expect(ledgerService.createEntry).not.toHaveBeenCalled();
      expect(dataSource.manager.update).not.toHaveBeenCalled();
    });

    it('should detect no drift', async () => {
      const mockBalance = createMockBalance();
      balanceService.getBalance.mockResolvedValue(mockBalance);
      hcmClient.fetchBalance.mockResolvedValue(mockHcmBalance);

      const result = await service.detectDrift('emp-1');

      expect(result).toEqual({
        hasDrift: false,
        localBalance: 100,
        hcmBalance: 100,
        difference: 0,
      });
    });
  });

  describe('syncEmployeesBatch', () => {
    it('should sync multiple employees efficiently', async () => {
      const employeeIds = ['emp-1', 'emp-2', 'emp-3'];
      const balances = new Map([
        ['emp-1', { ...mockHcmBalance, employeeId: 'emp-1', availableHours: 100 }],
        ['emp-2', { ...mockHcmBalance, employeeId: 'emp-2', availableHours: 105 }],
        ['emp-3', { ...mockHcmBalance, employeeId: 'emp-3', availableHours: 95 }],
      ]);

      hcmClient.fetchBalancesBatch.mockResolvedValue(balances);
      balanceService.getBalance
        .mockResolvedValueOnce(createMockBalance({ employeeId: 'emp-1', availableHours: 100 }))
        .mockResolvedValueOnce(createMockBalance({ employeeId: 'emp-2', availableHours: 100 }))
        .mockResolvedValueOnce(createMockBalance({ employeeId: 'emp-3', availableHours: 100 }));

      const results = await service.syncEmployeesBatch(employeeIds);

      expect(results).toHaveLength(3);
      expect(results[0].driftDetected).toBe(false);
      expect(results[1].driftDetected).toBe(true);
      expect(results[1].difference).toBe(5);
      expect(results[2].driftDetected).toBe(true);
      expect(results[2].difference).toBe(-5);

      expect(hcmClient.fetchBalancesBatch).toHaveBeenCalledWith(employeeIds);
      expect(ledgerService.createEntry).toHaveBeenCalledTimes(2); // Only for emp-2 and emp-3
    });

    it('should handle missing HCM data gracefully', async () => {
      const employeeIds = ['emp-1', 'emp-2'];
      const balances = new Map([
        ['emp-1', { ...mockHcmBalance, employeeId: 'emp-1', availableHours: 100 }],
        // emp-2 missing
      ]);

      hcmClient.fetchBalancesBatch.mockResolvedValue(balances);
      balanceService.getBalance.mockResolvedValue(createMockBalance({ employeeId: 'emp-1' }));

      const results = await service.syncEmployeesBatch(employeeIds);

      expect(results).toHaveLength(1); // Only emp-1
      expect(results[0].employeeId).toBe('emp-1');
    });

    it('should process large batches in chunks of 100', async () => {
      const employeeIds = Array.from({ length: 250 }, (_, i) => `emp-${i}`);
      const balances = new Map(
        employeeIds.map((id) => [id, { ...mockHcmBalance, employeeId: id }]),
      );

      hcmClient.fetchBalancesBatch.mockResolvedValue(balances);
      balanceService.getBalance.mockResolvedValue(createMockBalance());

      await service.syncEmployeesBatch(employeeIds);

      // Should be called 3 times: 100, 100, 50
      expect(hcmClient.fetchBalancesBatch).toHaveBeenCalledTimes(3);
      expect(hcmClient.fetchBalancesBatch).toHaveBeenNthCalledWith(1, employeeIds.slice(0, 100));
      expect(hcmClient.fetchBalancesBatch).toHaveBeenNthCalledWith(2, employeeIds.slice(100, 200));
      expect(hcmClient.fetchBalancesBatch).toHaveBeenNthCalledWith(3, employeeIds.slice(200, 250));
    });
  });

  describe('getLatestCheckpoint', () => {
    it('should return the latest checkpoint', async () => {
      const mockCheckpoint: SyncCheckpoint = {
        id: 'checkpoint-1',
        startedAt: new Date(),
        completedAt: new Date(),
        totalEmployees: 100,
        processedEmployees: 100,
        driftDetectedCount: 5,
        status: 'COMPLETED',
        driftDetails: [],
      };

      syncRepository.findLatest.mockResolvedValue(mockCheckpoint);

      const result = await service.getLatestCheckpoint();

      expect(result).toEqual(mockCheckpoint);
      expect(syncRepository.findLatest).toHaveBeenCalledTimes(1);
    });

    it('should return null if no checkpoint exists', async () => {
      syncRepository.findLatest.mockResolvedValue(null);

      const result = await service.getLatestCheckpoint();

      expect(result).toBeNull();
    });
  });

  describe('getSyncProgress', () => {
    it('should return progress for in-progress sync', async () => {
      const mockCheckpoint: SyncCheckpoint = {
        id: 'checkpoint-1',
        startedAt: new Date(),
        totalEmployees: 100,
        processedEmployees: 50,
        driftDetectedCount: 5,
        status: 'IN_PROGRESS',
        driftDetails: [],
      };

      syncRepository.findLatest.mockResolvedValue(mockCheckpoint);

      const result = await service.getSyncProgress();

      expect(result).toEqual({
        inProgress: true,
        checkpoint: mockCheckpoint,
        progressPercentage: 50,
      });
    });

    it('should return not in progress for completed sync', async () => {
      const mockCheckpoint: SyncCheckpoint = {
        id: 'checkpoint-1',
        startedAt: new Date(),
        completedAt: new Date(),
        totalEmployees: 100,
        processedEmployees: 100,
        driftDetectedCount: 5,
        status: 'COMPLETED',
        driftDetails: [],
      };

      syncRepository.findLatest.mockResolvedValue(mockCheckpoint);

      const result = await service.getSyncProgress();

      expect(result).toEqual({ inProgress: false });
    });

    it('should return not in progress when no checkpoint exists', async () => {
      syncRepository.findLatest.mockResolvedValue(null);

      const result = await service.getSyncProgress();

      expect(result).toEqual({ inProgress: false });
    });

    it('should handle zero total employees', async () => {
      const mockCheckpoint: SyncCheckpoint = {
        id: 'checkpoint-1',
        startedAt: new Date(),
        totalEmployees: 0,
        processedEmployees: 0,
        driftDetectedCount: 0,
        status: 'IN_PROGRESS',
        driftDetails: [],
      };

      syncRepository.findLatest.mockResolvedValue(mockCheckpoint);

      const result = await service.getSyncProgress();

      expect(result.progressPercentage).toBe(0);
    });
  });

  describe('drift correction transaction', () => {
    it('should execute drift correction in a transaction', async () => {
      const mockBalance = createMockBalance();
      const driftedHcmBalance = { ...mockHcmBalance, availableHours: 105 };
      const mockManager = {
        update: jest.fn().mockResolvedValue({}),
      } as unknown as EntityManager;

      balanceService.getBalance.mockResolvedValue(mockBalance);
      hcmClient.fetchBalance.mockResolvedValue(driftedHcmBalance);
      dataSource.transaction = jest.fn((cb) => cb(mockManager)) as any;

      await service.syncEmployee('emp-1');

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(ledgerService.createEntry).toHaveBeenCalled();
      expect(mockManager.update).toHaveBeenCalledWith(
        BalanceRecord,
        { employeeId: 'emp-1' },
        {
          availableHours: 105,
          accruedHours: 120,
          usedHours: 20,
          lastSyncedAt: expect.any(Date),
        },
      );
    });
  });
});
