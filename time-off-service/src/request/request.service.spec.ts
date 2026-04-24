import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { RequestService } from './request.service';
import { RequestRepository } from './repositories/request.repository';
import { AuditService } from '../audit/audit.service';
import { BalanceService } from '../balance/balance.service';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { BalanceRecord } from '../balance/entities/balance-record.entity';
import { InsufficientBalanceException } from '../common/exceptions/custom-exceptions';

describe('RequestService - Graceful Degradation', () => {
  let service: RequestService;
  let mockRequestRepository: jest.Mocked<RequestRepository>;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockBalanceService: jest.Mocked<BalanceService>;

  beforeEach(async () => {
    // Create mocks
    mockRequestRepository = {
      findByIdOrFail: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      findByEmployeeAndDateOverlap: jest.fn(),
      findMany: jest.fn(),
    } as any;

    mockAuditService = {
      log: jest.fn(),
    } as any;

    mockBalanceService = {
      getBalance: jest.fn(),
      isHcmAvailable: jest.fn(),
      syncBalance: jest.fn(),
      deductBalance: jest.fn(),
      restoreBalance: jest.fn(),
      getLedgerHistory: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestService,
        {
          provide: RequestRepository,
          useValue: mockRequestRepository,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: BalanceService,
          useValue: mockBalanceService,
        },
      ],
    }).compile();

    service = module.get<RequestService>(RequestService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('submitRequest - HCM Availability Check', () => {
    const employeeId = 'emp-123';
    const requestId = 'req-456';
    const actorId = employeeId;
    const actorRole = 'EMPLOYEE';

    const draftRequest: TimeOffRequest = {
      id: requestId,
      employeeId,
      managerId: 'mgr-789',
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-05'),
      hoursRequested: 40,
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    } as TimeOffRequest;

    const balance: BalanceRecord = {
      id: 'bal-123',
      employeeId,
      availableHours: 80,
      accruedHours: 120,
      usedHours: 40,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      isStale: false,
    } as BalanceRecord;

    it('should allow submission when HCM is available', async () => {
      // Arrange
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(draftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(true);
      mockBalanceService.getBalance.mockResolvedValueOnce(balance);
      mockRequestRepository.findByEmployeeAndDateOverlap.mockResolvedValueOnce([]);
      mockRequestRepository.save.mockResolvedValueOnce({
        ...draftRequest,
        status: 'PENDING',
        submittedAt: new Date(),
      });

      // Act
      const result = await service.submitRequest(requestId, actorId, actorRole as any);

      // Assert
      expect(result.status).toBe('PENDING');
      expect(mockBalanceService.isHcmAvailable).toHaveBeenCalled();
      expect(mockBalanceService.getBalance).toHaveBeenCalledWith(employeeId);
      expect(mockRequestRepository.save).toHaveBeenCalled();
    });

    it('should prevent submission when HCM is unavailable', async () => {
      // Arrange
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(false);

      // Act & Assert
      await expect(
        service.submitRequest(requestId, actorId, actorRole as any),
      ).rejects.toThrow(InsufficientBalanceException);

      expect(mockBalanceService.isHcmAvailable).toHaveBeenCalled();
      expect(mockBalanceService.getBalance).not.toHaveBeenCalled();
      expect(mockRequestRepository.save).not.toHaveBeenCalled();
    });

    it('should include clear error message when HCM is unavailable', async () => {
      // Arrange
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(false);

      // Act & Assert
      try {
        await service.submitRequest(requestId, actorId, actorRole as any);
        fail('Should have thrown InsufficientBalanceException');
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientBalanceException);
        expect(error.message).toContain('HCM system is currently unavailable');
        expect(error.message).toContain('Please try again later');
      }
    });

    it('should check HCM availability before checking balance', async () => {
      // Arrange
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(false);

      // Act
      try {
        await service.submitRequest(requestId, actorId, actorRole as any);
      } catch {
        // Expected to throw
      }

      // Assert
      expect(mockBalanceService.isHcmAvailable).toHaveBeenCalled();
      expect(mockBalanceService.getBalance).not.toHaveBeenCalled();
    });

    it('should still enforce ownership check before HCM check', async () => {
      // Arrange
      mockRequestRepository.findByIdOrFail.mockResolvedValue(draftRequest);
      const differentActorId = 'different-emp';

      // Act & Assert
      await expect(
        service.submitRequest(requestId, differentActorId, actorRole as any),
      ).rejects.toThrow(ForbiddenException);

      expect(mockBalanceService.isHcmAvailable).not.toHaveBeenCalled();
    });

    it('should still check balance after HCM availability', async () => {
      // Arrange
      const insufficientBalance = {
        ...balance,
        availableHours: 20,
        isStale: false,
      } as BalanceRecord; // Less than requested 40
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(true);
      mockBalanceService.getBalance.mockResolvedValueOnce(insufficientBalance);

      // Act & Assert
      await expect(
        service.submitRequest(requestId, actorId, actorRole as any),
      ).rejects.toThrow(InsufficientBalanceException);

      expect(mockBalanceService.isHcmAvailable).toHaveBeenCalled();
      expect(mockBalanceService.getBalance).toHaveBeenCalled();
    });

    it('should still check for overlapping requests', async () => {
      // Arrange
      const overlappingRequest = { ...draftRequest, id: 'other-req' };
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(true);
      mockBalanceService.getBalance.mockResolvedValueOnce(balance);
      mockRequestRepository.findByEmployeeAndDateOverlap.mockResolvedValueOnce([overlappingRequest]);

      // Act & Assert
      await expect(
        service.submitRequest(requestId, actorId, actorRole as any),
      ).rejects.toThrow('Request dates overlap with an existing request');

      expect(mockBalanceService.isHcmAvailable).toHaveBeenCalled();
      expect(mockRequestRepository.findByEmployeeAndDateOverlap).toHaveBeenCalled();
    });

    it('should create audit log on successful submission', async () => {
      // Arrange
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(true);
      mockBalanceService.getBalance.mockResolvedValueOnce(balance);
      mockRequestRepository.findByEmployeeAndDateOverlap.mockResolvedValueOnce([]);
      mockRequestRepository.save.mockResolvedValueOnce({
        ...draftRequest,
        status: 'PENDING',
        submittedAt: new Date(),
      });

      // Act
      await service.submitRequest(requestId, actorId, actorRole as any);

      // Assert
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'REQUEST_SUBMITTED',
          actorId,
          actorRole,
          entityId: requestId,
          entityType: 'TimeOffRequest',
        }),
      );
    });
  });

  describe('submitRequest - Manager/Admin Roles', () => {
    const employeeId = 'emp-123';
    const requestId = 'req-456';
    const managerId = 'mgr-789';

    const draftRequest: TimeOffRequest = {
      id: requestId,
      employeeId,
      managerId,
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-05'),
      hoursRequested: 40,
      status: 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    } as TimeOffRequest;

    const balance: BalanceRecord = {
      id: 'bal-123',
      employeeId,
      availableHours: 80,
      accruedHours: 120,
      usedHours: 40,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      isStale: false,
    } as BalanceRecord;

    it('should allow manager to submit when HCM is available', async () => {
      // Arrange
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(true);
      mockBalanceService.getBalance.mockResolvedValueOnce(balance);
      mockRequestRepository.findByEmployeeAndDateOverlap.mockResolvedValueOnce([]);
      mockRequestRepository.save.mockResolvedValueOnce({
        ...draftRequest,
        status: 'PENDING',
        submittedAt: new Date(),
      });

      // Act
      const result = await service.submitRequest(requestId, managerId, 'MANAGER' as any);

      // Assert
      expect(result.status).toBe('PENDING');
      expect(mockBalanceService.isHcmAvailable).toHaveBeenCalled();
    });

    it('should prevent manager submission when HCM is unavailable', async () => {
      // Arrange
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(false);

      // Act & Assert
      await expect(
        service.submitRequest(requestId, managerId, 'MANAGER' as any),
      ).rejects.toThrow(InsufficientBalanceException);
    });

    it('should allow admin to submit when HCM is available', async () => {
      // Arrange
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(true);
      mockBalanceService.getBalance.mockResolvedValueOnce(balance);
      mockRequestRepository.findByEmployeeAndDateOverlap.mockResolvedValueOnce([]);
      mockRequestRepository.save.mockResolvedValueOnce({
        ...draftRequest,
        status: 'PENDING',
        submittedAt: new Date(),
      });

      // Act
      const result = await service.submitRequest(requestId, 'admin-001', 'ADMIN' as any);

      // Assert
      expect(result.status).toBe('PENDING');
    });

    it('should prevent admin submission when HCM is unavailable', async () => {
      // Arrange
      const freshDraftRequest = { ...draftRequest, status: 'DRAFT' as const };
      mockRequestRepository.findByIdOrFail.mockResolvedValueOnce(freshDraftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValueOnce(false);

      // Act & Assert
      await expect(
        service.submitRequest(requestId, 'admin-001', 'ADMIN' as any),
      ).rejects.toThrow(InsufficientBalanceException);
    });
  });

  describe('createRequest - Should Work During HCM Outage', () => {
    const employeeId = 'emp-123';
    const actorId = employeeId;
    const actorRole = 'EMPLOYEE';

    const createDto = {
      employeeId,
      managerId: 'mgr-789',
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-05'),
      hoursRequested: 40,
    };

    it('should allow creating DRAFT request when HCM is unavailable', async () => {
      // Arrange
      const createdRequest: TimeOffRequest = {
        id: 'req-new',
        ...createDto,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      } as TimeOffRequest;

      mockRequestRepository.create.mockResolvedValue(createdRequest);

      // Act
      const result = await service.createRequest(createDto, actorId, actorRole as any);

      // Assert
      expect(result.status).toBe('DRAFT');
      expect(mockRequestRepository.create).toHaveBeenCalled();
      expect(mockBalanceService.isHcmAvailable).not.toHaveBeenCalled(); // No HCM check for DRAFT
    });

    it('should create audit log for DRAFT request creation', async () => {
      // Arrange
      const createdRequest: TimeOffRequest = {
        id: 'req-new',
        ...createDto,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      } as TimeOffRequest;

      mockRequestRepository.create.mockResolvedValue(createdRequest);

      // Act
      await service.createRequest(createDto, actorId, actorRole as any);

      // Assert
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          operationType: 'REQUEST_CREATED',
          actorId,
          actorRole,
        }),
      );
    });
  });

  describe('getRequest - Should Work During HCM Outage', () => {
    const requestId = 'req-123';
    const request: TimeOffRequest = {
      id: requestId,
      employeeId: 'emp-123',
      managerId: 'mgr-789',
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-05'),
      hoursRequested: 40,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    } as TimeOffRequest;

    it('should return request when HCM is unavailable', async () => {
      // Arrange
      mockRequestRepository.findByIdOrFail.mockResolvedValue(request);

      // Act
      const result = await service.getRequest(requestId);

      // Assert
      expect(result).toEqual(request);
      expect(mockBalanceService.isHcmAvailable).not.toHaveBeenCalled();
    });
  });

  describe('listRequests - Should Work During HCM Outage', () => {
    const actorId = 'emp-123';
    const actorRole = 'EMPLOYEE';
    const filters = { employeeId: actorId };

    it('should list requests when HCM is unavailable', async () => {
      // Arrange
      const paginatedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      };
      mockRequestRepository.findMany.mockResolvedValue(paginatedResult);

      // Act
      const result = await service.listRequests(filters, actorId, actorRole as any);

      // Assert
      expect(result).toEqual(paginatedResult);
      expect(mockBalanceService.isHcmAvailable).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle HCM availability check timeout gracefully', async () => {
      // Arrange
      const requestId = 'req-123';
      const draftRequest: TimeOffRequest = {
        id: requestId,
        employeeId: 'emp-123',
        managerId: 'mgr-789',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-05'),
        hoursRequested: 40,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      } as TimeOffRequest;

      mockRequestRepository.findByIdOrFail.mockResolvedValue(draftRequest);
      mockBalanceService.isHcmAvailable.mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100)),
      );

      // Act & Assert
      await expect(
        service.submitRequest(requestId, 'emp-123', 'EMPLOYEE' as any),
      ).rejects.toThrow();
    });

    it('should handle concurrent submission attempts during HCM outage', async () => {
      // Arrange
      const requestId = 'req-123';
      const draftRequest: TimeOffRequest = {
        id: requestId,
        employeeId: 'emp-123',
        managerId: 'mgr-789',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-02-05'),
        hoursRequested: 40,
        status: 'DRAFT',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      } as TimeOffRequest;

      mockRequestRepository.findByIdOrFail.mockResolvedValue(draftRequest);
      mockBalanceService.isHcmAvailable.mockResolvedValue(false);

      // Act
      const results = await Promise.allSettled([
        service.submitRequest(requestId, 'emp-123', 'EMPLOYEE' as any),
        service.submitRequest(requestId, 'emp-123', 'EMPLOYEE' as any),
        service.submitRequest(requestId, 'emp-123', 'EMPLOYEE' as any),
      ]);

      // Assert
      results.forEach((result) => {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(InsufficientBalanceException);
        }
      });
    });
  });
});
