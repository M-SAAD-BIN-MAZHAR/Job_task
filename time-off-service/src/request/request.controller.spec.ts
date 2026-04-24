import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { RequestController } from './request.controller';
import { RequestService } from './request.service';
import { ApprovalSagaOrchestrator } from '../saga/approval-saga.orchestrator';
import { TimeOffRequest, RequestStatus } from './entities/time-off-request.entity';
import { PaginatedResult } from './repositories/request.repository';

describe('RequestController', () => {
  let controller: RequestController;
  let requestService: jest.Mocked<RequestService>;
  let sagaOrchestrator: jest.Mocked<ApprovalSagaOrchestrator>;

  const createMockRequest = (overrides?: Partial<TimeOffRequest>): TimeOffRequest => {
    return {
      id: 'req-123',
      employeeId: 'emp-123',
      managerId: 'mgr-456',
      startDate: new Date('2024-02-01'),
      endDate: new Date('2024-02-05'),
      hoursRequested: 40,
      status: 'DRAFT' as RequestStatus,
      createdAt: new Date('2024-01-15T10:00:00Z'),
      updatedAt: new Date('2024-01-15T10:00:00Z'),
      version: 1,
      ...overrides,
    } as TimeOffRequest;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RequestController],
      providers: [
        {
          provide: RequestService,
          useValue: {
            createRequest: jest.fn(),
            getRequest: jest.fn(),
            updateRequest: jest.fn(),
            submitRequest: jest.fn(),
            rejectRequest: jest.fn(),
            cancelRequest: jest.fn(),
            listRequests: jest.fn(),
          },
        },
        {
          provide: ApprovalSagaOrchestrator,
          useValue: {
            executeApprovalSaga: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<RequestController>(RequestController);
    requestService = module.get(RequestService);
    sagaOrchestrator = module.get(ApprovalSagaOrchestrator);
  });

  describe('createRequest', () => {
    it('should create a request for employee creating their own request', async () => {
      const mockRequest = createMockRequest();
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };
      const dto = {
        employeeId: 'emp-123',
        managerId: 'mgr-456',
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        hoursRequested: 40,
      };

      requestService.createRequest.mockResolvedValue(mockRequest);

      const result = await controller.createRequest(dto, mockUser);

      expect(result.id).toBe('req-123');
      expect(result.status).toBe('DRAFT');
      expect(requestService.createRequest).toHaveBeenCalledWith(
        {
          ...dto,
          startDate: new Date('2024-02-01'),
          endDate: new Date('2024-02-05'),
        },
        'emp-123',
        'EMPLOYEE',
      );
    });

    it('should throw ForbiddenException when employee tries to create request for another employee', async () => {
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };
      const dto = {
        employeeId: 'emp-456',
        managerId: 'mgr-456',
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        hoursRequested: 40,
      };

      await expect(controller.createRequest(dto, mockUser)).rejects.toThrow(ForbiddenException);
      await expect(controller.createRequest(dto, mockUser)).rejects.toThrow(
        'Employees can only create requests for themselves',
      );
      expect(requestService.createRequest).not.toHaveBeenCalled();
    });

    it('should allow manager to create request for any employee', async () => {
      const mockRequest = createMockRequest({ employeeId: 'emp-456' });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };
      const dto = {
        employeeId: 'emp-456',
        managerId: 'mgr-456',
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        hoursRequested: 40,
      };

      requestService.createRequest.mockResolvedValue(mockRequest);

      const result = await controller.createRequest(dto, mockUser);

      expect(result.employeeId).toBe('emp-456');
      expect(requestService.createRequest).toHaveBeenCalled();
    });

    it('should allow admin to create request for any employee', async () => {
      const mockRequest = createMockRequest({ employeeId: 'emp-456' });
      const mockUser = { user: { sub: 'admin-1', role: 'ADMIN' } };
      const dto = {
        employeeId: 'emp-456',
        managerId: 'mgr-456',
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        hoursRequested: 40,
      };

      requestService.createRequest.mockResolvedValue(mockRequest);

      const result = await controller.createRequest(dto, mockUser);

      expect(result.employeeId).toBe('emp-456');
      expect(requestService.createRequest).toHaveBeenCalled();
    });

    it('should throw BadRequestException when startDate is after endDate', async () => {
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };
      const dto = {
        employeeId: 'emp-123',
        managerId: 'mgr-456',
        startDate: '2024-02-10',
        endDate: '2024-02-05',
        hoursRequested: 40,
      };

      await expect(controller.createRequest(dto, mockUser)).rejects.toThrow(BadRequestException);
      await expect(controller.createRequest(dto, mockUser)).rejects.toThrow(
        'startDate must be before or equal to endDate',
      );
      expect(requestService.createRequest).not.toHaveBeenCalled();
    });

    it('should include idempotencyKey when provided', async () => {
      const mockRequest = createMockRequest({ idempotencyKey: 'key-123' });
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };
      const dto = {
        employeeId: 'emp-123',
        managerId: 'mgr-456',
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        hoursRequested: 40,
        idempotencyKey: 'key-123',
      };

      requestService.createRequest.mockResolvedValue(mockRequest);

      const result = await controller.createRequest(dto, mockUser);

      expect(requestService.createRequest).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'key-123' }),
        'emp-123',
        'EMPLOYEE',
      );
    });
  });

  describe('listRequests', () => {
    it('should return paginated requests for employee (filtered to own requests)', async () => {
      const mockResult: PaginatedResult<TimeOffRequest> = {
        data: [createMockRequest()],
        total: 1,
        page: 1,
        limit: 20,
      };
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };

      requestService.listRequests.mockResolvedValue(mockResult);

      const result = await controller.listRequests({}, mockUser);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(requestService.listRequests).toHaveBeenCalledWith({}, 'emp-123', 'EMPLOYEE');
    });

    it('should return paginated requests for manager', async () => {
      const mockResult: PaginatedResult<TimeOffRequest> = {
        data: [createMockRequest(), createMockRequest({ id: 'req-456', employeeId: 'emp-456' })],
        total: 2,
        page: 1,
        limit: 20,
      };
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };

      requestService.listRequests.mockResolvedValue(mockResult);

      const result = await controller.listRequests({}, mockUser);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should apply filters when provided', async () => {
      const mockResult: PaginatedResult<TimeOffRequest> = {
        data: [createMockRequest({ status: 'PENDING' })],
        total: 1,
        page: 1,
        limit: 20,
      };
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };
      const filters = {
        status: 'PENDING' as RequestStatus,
        employeeId: 'emp-123',
        page: 1,
        limit: 10,
      };

      requestService.listRequests.mockResolvedValue(mockResult);

      const result = await controller.listRequests(filters, mockUser);

      expect(result.data[0].status).toBe('PENDING');
      expect(requestService.listRequests).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING', employeeId: 'emp-123' }),
        'mgr-123',
        'MANAGER',
      );
    });

    it('should convert date string filters to Date objects', async () => {
      const mockResult: PaginatedResult<TimeOffRequest> = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      };
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };
      const filters = {
        startDateFrom: '2024-01-01',
        startDateTo: '2024-01-31',
      };

      requestService.listRequests.mockResolvedValue(mockResult);

      await controller.listRequests(filters, mockUser);

      expect(requestService.listRequests).toHaveBeenCalledWith(
        expect.objectContaining({
          startDateFrom: new Date('2024-01-01'),
          startDateTo: new Date('2024-01-31'),
        }),
        'mgr-123',
        'MANAGER',
      );
    });
  });

  describe('getRequest', () => {
    it('should return request for employee viewing their own request', async () => {
      const mockRequest = createMockRequest();
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };

      requestService.getRequest.mockResolvedValue(mockRequest);

      const result = await controller.getRequest('req-123', mockUser);

      expect(result.id).toBe('req-123');
      expect(result.employeeId).toBe('emp-123');
      expect(requestService.getRequest).toHaveBeenCalledWith('req-123');
    });

    it('should throw ForbiddenException when employee tries to view another employee request', async () => {
      const mockRequest = createMockRequest({ employeeId: 'emp-456' });
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };

      requestService.getRequest.mockResolvedValue(mockRequest);

      await expect(controller.getRequest('req-123', mockUser)).rejects.toThrow(ForbiddenException);
      await expect(controller.getRequest('req-123', mockUser)).rejects.toThrow(
        'Employees can only view their own requests',
      );
    });

    it('should allow manager to view any request', async () => {
      const mockRequest = createMockRequest({ employeeId: 'emp-456' });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };

      requestService.getRequest.mockResolvedValue(mockRequest);

      const result = await controller.getRequest('req-123', mockUser);

      expect(result.employeeId).toBe('emp-456');
    });

    it('should allow admin to view any request', async () => {
      const mockRequest = createMockRequest({ employeeId: 'emp-456' });
      const mockUser = { user: { sub: 'admin-1', role: 'ADMIN' } };

      requestService.getRequest.mockResolvedValue(mockRequest);

      const result = await controller.getRequest('req-123', mockUser);

      expect(result.employeeId).toBe('emp-456');
    });
  });

  describe('updateRequest', () => {
    it('should update request for employee updating their own request', async () => {
      const mockRequest = createMockRequest();
      const updatedRequest = createMockRequest({ hoursRequested: 32 });
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };
      const dto = { hoursRequested: 32 };

      requestService.getRequest.mockResolvedValue(mockRequest);
      requestService.updateRequest.mockResolvedValue(updatedRequest);

      const result = await controller.updateRequest('req-123', dto, mockUser);

      expect(result.hoursRequested).toBe(32);
      expect(requestService.updateRequest).toHaveBeenCalledWith(
        'req-123',
        { hoursRequested: 32 },
        'emp-123',
        'EMPLOYEE',
      );
    });

    it('should throw ForbiddenException when employee tries to update another employee request', async () => {
      const mockRequest = createMockRequest({ employeeId: 'emp-456' });
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };
      const dto = { hoursRequested: 32 };

      requestService.getRequest.mockResolvedValue(mockRequest);

      await expect(controller.updateRequest('req-123', dto, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(requestService.updateRequest).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when startDate is after endDate', async () => {
      const mockRequest = createMockRequest();
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };
      const dto = {
        startDate: '2024-02-10',
        endDate: '2024-02-05',
      };

      requestService.getRequest.mockResolvedValue(mockRequest);

      await expect(controller.updateRequest('req-123', dto, mockUser)).rejects.toThrow(
        BadRequestException,
      );
      expect(requestService.updateRequest).not.toHaveBeenCalled();
    });

    it('should convert date strings to Date objects', async () => {
      const mockRequest = createMockRequest();
      const updatedRequest = createMockRequest({
        startDate: new Date('2024-02-10'),
        endDate: new Date('2024-02-15'),
      });
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };
      const dto = {
        startDate: '2024-02-10',
        endDate: '2024-02-15',
      };

      requestService.getRequest.mockResolvedValue(mockRequest);
      requestService.updateRequest.mockResolvedValue(updatedRequest);

      await controller.updateRequest('req-123', dto, mockUser);

      expect(requestService.updateRequest).toHaveBeenCalledWith(
        'req-123',
        {
          startDate: new Date('2024-02-10'),
          endDate: new Date('2024-02-15'),
        },
        'emp-123',
        'EMPLOYEE',
      );
    });

    it('should allow manager to update any request', async () => {
      const mockRequest = createMockRequest({ employeeId: 'emp-456' });
      const updatedRequest = createMockRequest({ employeeId: 'emp-456', hoursRequested: 32 });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };
      const dto = { hoursRequested: 32 };

      requestService.getRequest.mockResolvedValue(mockRequest);
      requestService.updateRequest.mockResolvedValue(updatedRequest);

      const result = await controller.updateRequest('req-123', dto, mockUser);

      expect(result.hoursRequested).toBe(32);
    });
  });

  describe('submitRequest', () => {
    it('should submit request for employee submitting their own request', async () => {
      const submittedRequest = createMockRequest({
        status: 'PENDING',
        submittedAt: new Date('2024-01-15T11:00:00Z'),
      });
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };

      requestService.submitRequest.mockResolvedValue(submittedRequest);

      const result = await controller.submitRequest('req-123', mockUser);

      expect(result.status).toBe('PENDING');
      expect(result.submittedAt).toBeDefined();
      expect(requestService.submitRequest).toHaveBeenCalledWith('req-123', 'emp-123', 'EMPLOYEE');
    });

    it('should allow manager to submit any request', async () => {
      const submittedRequest = createMockRequest({
        employeeId: 'emp-456',
        status: 'PENDING',
        submittedAt: new Date('2024-01-15T11:00:00Z'),
      });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };

      requestService.submitRequest.mockResolvedValue(submittedRequest);

      const result = await controller.submitRequest('req-123', mockUser);

      expect(result.status).toBe('PENDING');
    });

    it('should allow admin to submit any request', async () => {
      const submittedRequest = createMockRequest({
        employeeId: 'emp-456',
        status: 'PENDING',
        submittedAt: new Date('2024-01-15T11:00:00Z'),
      });
      const mockUser = { user: { sub: 'admin-1', role: 'ADMIN' } };

      requestService.submitRequest.mockResolvedValue(submittedRequest);

      const result = await controller.submitRequest('req-123', mockUser);

      expect(result.status).toBe('PENDING');
    });
  });

  describe('approveRequest', () => {
    it('should approve request for manager', async () => {
      const mockRequest = createMockRequest({ status: 'PENDING' });
      const approvedRequest = createMockRequest({
        status: 'PENDING',
        resolvedAt: new Date('2024-01-15T12:00:00Z'),
      });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };

      requestService.getRequest.mockResolvedValueOnce(mockRequest);
      sagaOrchestrator.executeApprovalSaga.mockResolvedValue({
        success: true,
        finalStatus: 'PENDING',
      });
      requestService.getRequest.mockResolvedValueOnce(approvedRequest);

      const result = await controller.approveRequest('req-123', mockUser);

      expect(result.status).toBe('PENDING');
      expect(sagaOrchestrator.executeApprovalSaga).toHaveBeenCalledWith(mockRequest, 'mgr-123');
    });

    it('should approve request for admin', async () => {
      const mockRequest = createMockRequest({ status: 'PENDING' });
      const approvedRequest = createMockRequest({ status: 'PENDING' });
      const mockUser = { user: { sub: 'admin-1', role: 'ADMIN' } };

      requestService.getRequest.mockResolvedValueOnce(mockRequest);
      sagaOrchestrator.executeApprovalSaga.mockResolvedValue({
        success: true,
        finalStatus: 'PENDING',
      });
      requestService.getRequest.mockResolvedValueOnce(approvedRequest);

      const result = await controller.approveRequest('req-123', mockUser);

      expect(sagaOrchestrator.executeApprovalSaga).toHaveBeenCalledWith(mockRequest, 'admin-1');
    });

    it('should throw BadRequestException when saga fails', async () => {
      const mockRequest = createMockRequest({ status: 'PENDING' });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };

      requestService.getRequest.mockResolvedValue(mockRequest);
      sagaOrchestrator.executeApprovalSaga.mockResolvedValue({
        success: false,
        finalStatus: 'REJECTED',
        errorMessage: 'Insufficient balance',
      });

      await expect(controller.approveRequest('req-123', mockUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.approveRequest('req-123', mockUser)).rejects.toThrow(
        'Insufficient balance',
      );
    });
  });

  describe('rejectRequest', () => {
    it('should reject request for manager', async () => {
      const rejectedRequest = createMockRequest({
        status: 'REJECTED',
        rejectionReason: 'Insufficient coverage',
        resolvedAt: new Date('2024-01-15T12:00:00Z'),
      });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };
      const dto = { reason: 'Insufficient coverage' };

      requestService.rejectRequest.mockResolvedValue(rejectedRequest);

      const result = await controller.rejectRequest('req-123', dto, mockUser);

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionReason).toBe('Insufficient coverage');
      expect(requestService.rejectRequest).toHaveBeenCalledWith(
        'req-123',
        'mgr-123',
        'MANAGER',
        'Insufficient coverage',
      );
    });

    it('should reject request for admin', async () => {
      const rejectedRequest = createMockRequest({
        status: 'REJECTED',
        rejectionReason: 'Policy violation',
        resolvedAt: new Date('2024-01-15T12:00:00Z'),
      });
      const mockUser = { user: { sub: 'admin-1', role: 'ADMIN' } };
      const dto = { reason: 'Policy violation' };

      requestService.rejectRequest.mockResolvedValue(rejectedRequest);

      const result = await controller.rejectRequest('req-123', dto, mockUser);

      expect(result.status).toBe('REJECTED');
      expect(result.rejectionReason).toBe('Policy violation');
    });
  });

  describe('cancelRequest', () => {
    it('should cancel request for employee cancelling their own request', async () => {
      const cancelledRequest = createMockRequest({
        status: 'CANCELLED',
        resolvedAt: new Date('2024-01-15T12:00:00Z'),
      });
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };

      requestService.cancelRequest.mockResolvedValue(cancelledRequest);

      const result = await controller.cancelRequest('req-123', mockUser);

      expect(result.status).toBe('CANCELLED');
      expect(requestService.cancelRequest).toHaveBeenCalledWith('req-123', 'emp-123', 'EMPLOYEE');
    });

    it('should allow manager to cancel any request', async () => {
      const cancelledRequest = createMockRequest({
        employeeId: 'emp-456',
        status: 'CANCELLED',
        resolvedAt: new Date('2024-01-15T12:00:00Z'),
      });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };

      requestService.cancelRequest.mockResolvedValue(cancelledRequest);

      const result = await controller.cancelRequest('req-123', mockUser);

      expect(result.status).toBe('CANCELLED');
    });

    it('should allow admin to cancel any request', async () => {
      const cancelledRequest = createMockRequest({
        employeeId: 'emp-456',
        status: 'CANCELLED',
        resolvedAt: new Date('2024-01-15T12:00:00Z'),
      });
      const mockUser = { user: { sub: 'admin-1', role: 'ADMIN' } };

      requestService.cancelRequest.mockResolvedValue(cancelledRequest);

      const result = await controller.cancelRequest('req-123', mockUser);

      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('mapToResponseDto', () => {
    it('should correctly map TimeOffRequest to RequestResponseDto', async () => {
      const mockRequest = createMockRequest({
        submittedAt: new Date('2024-01-15T11:00:00Z'),
        resolvedAt: new Date('2024-01-15T12:00:00Z'),
      });
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };

      requestService.getRequest.mockResolvedValue(mockRequest);

      const result = await controller.getRequest('req-123', mockUser);

      expect(result).toEqual({
        id: 'req-123',
        employeeId: 'emp-123',
        managerId: 'mgr-456',
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        hoursRequested: 40,
        status: 'DRAFT',
        rejectionReason: undefined,
        createdAt: '2024-01-15T10:00:00.000Z',
        updatedAt: '2024-01-15T10:00:00.000Z',
        submittedAt: '2024-01-15T11:00:00.000Z',
        resolvedAt: '2024-01-15T12:00:00.000Z',
        version: 1,
      });
    });

    it('should handle optional fields correctly', async () => {
      const mockRequest = createMockRequest();
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };

      requestService.getRequest.mockResolvedValue(mockRequest);

      const result = await controller.getRequest('req-123', mockUser);

      expect(result.submittedAt).toBeUndefined();
      expect(result.resolvedAt).toBeUndefined();
      expect(result.rejectionReason).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should propagate errors from RequestService', async () => {
      const mockUser = { user: { sub: 'emp-123', role: 'EMPLOYEE' } };

      requestService.getRequest.mockRejectedValue(new Error('Request not found'));

      await expect(controller.getRequest('req-123', mockUser)).rejects.toThrow('Request not found');
    });

    it('should propagate errors from ApprovalSagaOrchestrator', async () => {
      const mockRequest = createMockRequest({ status: 'PENDING' });
      const mockUser = { user: { sub: 'mgr-123', role: 'MANAGER' } };

      requestService.getRequest.mockResolvedValue(mockRequest);
      sagaOrchestrator.executeApprovalSaga.mockRejectedValue(new Error('HCM unavailable'));

      await expect(controller.approveRequest('req-123', mockUser)).rejects.toThrow(
        'HCM unavailable',
      );
    });
  });
});
