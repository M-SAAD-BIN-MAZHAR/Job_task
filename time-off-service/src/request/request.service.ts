import { Injectable, ForbiddenException } from '@nestjs/common';
import {
  RequestRepository,
  RequestFilters,
  PaginatedResult,
} from './repositories/request.repository';
import { TimeOffRequest, RequestStatus } from './entities/time-off-request.entity';
import { validateTransition } from './state-machine/request-state-machine';
import { AuditService } from '../audit/audit.service';
import { BalanceService } from '../balance/balance.service';
import {
  EntityNotFoundException,
  InsufficientBalanceException,
  HcmUnavailableException,
} from '../common/exceptions/custom-exceptions';
import { ActorRole } from '../audit/entities/audit-log.entity';

export interface CreateRequestDto {
  employeeId: string;
  managerId: string;
  startDate: Date;
  endDate: Date;
  hoursRequested: number;
  idempotencyKey?: string;
}

export interface UpdateRequestDto {
  startDate?: Date;
  endDate?: Date;
  hoursRequested?: number;
}

@Injectable()
export class RequestService {
  constructor(
    private readonly requestRepository: RequestRepository,
    private readonly auditService: AuditService,
    private readonly balanceService: BalanceService,
  ) {}

  async createRequest(
    dto: CreateRequestDto,
    actorId: string,
    actorRole: ActorRole,
  ): Promise<TimeOffRequest> {
    if (dto.startDate > dto.endDate) {
      throw new Error('startDate must be before or equal to endDate');
    }

    const request = await this.requestRepository.create({
      ...dto,
      status: 'DRAFT',
    });

    await this.auditService.log({
      operationType: 'REQUEST_CREATED',
      actorId,
      actorRole,
      entityId: request.id,
      entityType: 'TimeOffRequest',
      newState: { status: 'DRAFT', employeeId: dto.employeeId },
    });

    return request;
  }

  async getRequest(requestId: string): Promise<TimeOffRequest> {
    return this.requestRepository.findByIdOrFail(requestId);
  }

  async updateRequest(
    requestId: string,
    dto: UpdateRequestDto,
    actorId: string,
    actorRole: ActorRole,
  ): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findByIdOrFail(requestId);

    if (request.status !== 'DRAFT') {
      throw new Error('Only DRAFT requests can be updated');
    }

    const previous = { ...request };
    Object.assign(request, dto);
    const saved = await this.requestRepository.save(request);

    await this.auditService.log({
      operationType: 'REQUEST_CREATED',
      actorId,
      actorRole,
      entityId: requestId,
      entityType: 'TimeOffRequest',
      previousState: previous as unknown as Record<string, unknown>,
      newState: saved as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async submitRequest(
    requestId: string,
    actorId: string,
    actorRole: ActorRole,
  ): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findByIdOrFail(requestId);

    // Ownership check
    if (actorRole === 'EMPLOYEE' && request.employeeId !== actorId) {
      throw new ForbiddenException('You can only submit your own requests');
    }

    validateTransition(request.status, 'PENDING');

    // Check HCM availability before allowing submission
    const hcmAvailable = await this.balanceService.isHcmAvailable();
    if (!hcmAvailable) {
      throw new InsufficientBalanceException(
        'Cannot submit request: HCM system is currently unavailable. Please try again later.',
      );
    }

    // Check balance
    const balance = await this.balanceService.getBalance(request.employeeId);
    if (balance.availableHours < request.hoursRequested) {
      throw new InsufficientBalanceException(
        `Requested ${request.hoursRequested} hours but available balance is ${balance.availableHours}`,
      );
    }

    // Check overlapping requests
    const overlapping = await this.requestRepository.findByEmployeeAndDateOverlap(
      request.employeeId,
      request.startDate,
      request.endDate,
      requestId,
    );
    if (overlapping.length > 0) {
      throw new Error('Request dates overlap with an existing request');
    }

    const previous = { status: request.status };
    request.status = 'PENDING';
    request.submittedAt = new Date();
    const saved = await this.requestRepository.save(request);

    await this.auditService.log({
      operationType: 'REQUEST_SUBMITTED',
      actorId,
      actorRole,
      entityId: requestId,
      entityType: 'TimeOffRequest',
      previousState: previous,
      newState: { status: 'PENDING' },
    });

    return saved;
  }

  async rejectRequest(
    requestId: string,
    managerId: string,
    actorRole: ActorRole,
    reason: string,
  ): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findByIdOrFail(requestId);
    validateTransition(request.status, 'REJECTED');

    const previous = { status: request.status };
    request.status = 'REJECTED';
    request.rejectionReason = reason;
    request.resolvedAt = new Date();
    const saved = await this.requestRepository.save(request);

    await this.auditService.log({
      operationType: 'REQUEST_REJECTED',
      actorId: managerId,
      actorRole,
      entityId: requestId,
      entityType: 'TimeOffRequest',
      previousState: previous,
      newState: { status: 'REJECTED', reason },
    });

    return saved;
  }

  async cancelRequest(
    requestId: string,
    actorId: string,
    actorRole: ActorRole,
  ): Promise<TimeOffRequest> {
    const request = await this.requestRepository.findByIdOrFail(requestId);

    if (actorRole === 'EMPLOYEE' && request.employeeId !== actorId) {
      throw new ForbiddenException('You can only cancel your own requests');
    }

    validateTransition(request.status, 'CANCELLED');

    const previous = { status: request.status };
    request.status = 'CANCELLED';
    request.resolvedAt = new Date();
    const saved = await this.requestRepository.save(request);

    await this.auditService.log({
      operationType: 'REQUEST_CANCELLED',
      actorId,
      actorRole,
      entityId: requestId,
      entityType: 'TimeOffRequest',
      previousState: previous,
      newState: { status: 'CANCELLED' },
    });

    return saved;
  }

  async listRequests(
    filters: RequestFilters,
    actorId: string,
    actorRole: ActorRole,
  ): Promise<PaginatedResult<TimeOffRequest>> {
    // Employees can only see their own requests
    if (actorRole === 'EMPLOYEE') {
      filters = { ...filters, employeeId: actorId };
    }
    return this.requestRepository.findMany(filters);
  }
}
