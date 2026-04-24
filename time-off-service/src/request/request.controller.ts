import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { RequestService } from './request.service';
import { ApprovalSagaOrchestrator } from '../saga/approval-saga.orchestrator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import {
  CreateRequestDto,
  UpdateRequestDto,
  RequestFiltersDto,
  RequestResponseDto,
  PaginatedRequestResponseDto,
  RejectRequestDto,
} from './dto';
import { TimeOffRequest } from './entities/time-off-request.entity';
import { ActorRole } from '../audit/entities/audit-log.entity';

@Controller('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequestController {
  private readonly logger = new Logger(RequestController.name);

  constructor(
    private readonly requestService: RequestService,
    private readonly sagaOrchestrator: ApprovalSagaOrchestrator,
  ) {}

  /**
   * POST /api/v1/requests
   * Create a new time-off request in DRAFT state
   * Access: EMPLOYEE (own), MANAGER, ADMIN
   * Requirements: 11.1
   */
  @Post()
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  async createRequest(
    @Body() dto: CreateRequestDto,
    @Request() req: any,
  ): Promise<RequestResponseDto> {
    this.logger.log(`POST /requests - User: ${req.user.sub}, Role: ${req.user.role}`);

    // Access control: EMPLOYEE can only create requests for themselves
    if (req.user.role === 'EMPLOYEE' && dto.employeeId !== req.user.sub) {
      throw new ForbiddenException('Employees can only create requests for themselves');
    }

    // Validate dates
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (startDate > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    const request = await this.requestService.createRequest(
      {
        ...dto,
        startDate,
        endDate,
      },
      req.user.sub,
      req.user.role as ActorRole,
    );

    return this.mapToResponseDto(request);
  }

  /**
   * GET /api/v1/requests
   * List time-off requests with filters and pagination
   * Access: EMPLOYEE (own), MANAGER, ADMIN
   * Requirements: 11.8
   */
  @Get()
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  async listRequests(
    @Query() filters: RequestFiltersDto,
    @Request() req: any,
  ): Promise<PaginatedRequestResponseDto> {
    this.logger.log(`GET /requests - User: ${req.user.sub}, Role: ${req.user.role}`);

    // Convert date strings to Date objects
    const requestFilters: any = {
      ...filters,
      startDateFrom: filters.startDateFrom ? new Date(filters.startDateFrom) : undefined,
      startDateTo: filters.startDateTo ? new Date(filters.startDateTo) : undefined,
    };

    const result = await this.requestService.listRequests(
      requestFilters,
      req.user.sub,
      req.user.role as ActorRole,
    );

    return {
      data: result.data.map((r) => this.mapToResponseDto(r)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * GET /api/v1/requests/:id
   * Get a single time-off request by ID
   * Access: EMPLOYEE (own), MANAGER, ADMIN
   * Requirements: 11.2
   */
  @Get(':id')
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  async getRequest(@Param('id') id: string, @Request() req: any): Promise<RequestResponseDto> {
    this.logger.log(`GET /requests/${id} - User: ${req.user.sub}, Role: ${req.user.role}`);

    const request = await this.requestService.getRequest(id);

    // Access control: EMPLOYEE can only view their own requests
    if (req.user.role === 'EMPLOYEE' && request.employeeId !== req.user.sub) {
      throw new ForbiddenException('Employees can only view their own requests');
    }

    return this.mapToResponseDto(request);
  }

  /**
   * PATCH /api/v1/requests/:id
   * Update a DRAFT time-off request
   * Access: EMPLOYEE (own), MANAGER, ADMIN
   * Requirements: 11.3
   */
  @Patch(':id')
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  async updateRequest(
    @Param('id') id: string,
    @Body() dto: UpdateRequestDto,
    @Request() req: any,
  ): Promise<RequestResponseDto> {
    this.logger.log(`PATCH /requests/${id} - User: ${req.user.sub}, Role: ${req.user.role}`);

    const request = await this.requestService.getRequest(id);

    // Access control: EMPLOYEE can only update their own requests
    if (req.user.role === 'EMPLOYEE' && request.employeeId !== req.user.sub) {
      throw new ForbiddenException('Employees can only update their own requests');
    }

    // Validate dates if provided
    if (dto.startDate && dto.endDate) {
      const startDate = new Date(dto.startDate);
      const endDate = new Date(dto.endDate);
      if (startDate > endDate) {
        throw new BadRequestException('startDate must be before or equal to endDate');
      }
    }

    const updateData: any = {};
    if (dto.startDate) updateData.startDate = new Date(dto.startDate);
    if (dto.endDate) updateData.endDate = new Date(dto.endDate);
    if (dto.hoursRequested !== undefined) updateData.hoursRequested = dto.hoursRequested;

    const updated = await this.requestService.updateRequest(
      id,
      updateData,
      req.user.sub,
      req.user.role as ActorRole,
    );

    return this.mapToResponseDto(updated);
  }

  /**
   * POST /api/v1/requests/:id/submit
   * Submit a DRAFT request to PENDING state
   * Access: EMPLOYEE (own), MANAGER, ADMIN
   * Requirements: 11.4
   */
  @Post(':id/submit')
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  async submitRequest(@Param('id') id: string, @Request() req: any): Promise<RequestResponseDto> {
    this.logger.log(`POST /requests/${id}/submit - User: ${req.user.sub}, Role: ${req.user.role}`);

    try {
      const submitted = await this.requestService.submitRequest(
        id,
        req.user.sub,
        req.user.role as ActorRole,
      );

      return this.mapToResponseDto(submitted);
    } catch (error) {
      // Provide clearer error message for HCM unavailability
      if (error.code === 'HCM_UNAVAILABLE') {
        throw new BadRequestException(
          'Cannot submit request: HCM system is currently unavailable. Please try again later.',
        );
      }
      throw error;
    }
  }

  /**
   * POST /api/v1/requests/:id/approve
   * Approve a PENDING request (initiates saga)
   * Access: MANAGER, ADMIN
   * Requirements: 11.5
   */
  @Post(':id/approve')
  @Roles('MANAGER', 'ADMIN')
  async approveRequest(@Param('id') id: string, @Request() req: any): Promise<RequestResponseDto> {
    this.logger.log(`POST /requests/${id}/approve - User: ${req.user.sub}, Role: ${req.user.role}`);

    const request = await this.requestService.getRequest(id);

    // Execute approval saga
    const result = await this.sagaOrchestrator.executeApprovalSaga(request, req.user.sub);

    if (!result.success) {
      throw new BadRequestException(result.errorMessage || 'Approval saga failed');
    }

    // Fetch updated request
    const updated = await this.requestService.getRequest(id);
    return this.mapToResponseDto(updated);
  }

  /**
   * POST /api/v1/requests/:id/reject
   * Reject a PENDING request
   * Access: MANAGER, ADMIN
   * Requirements: 11.6
   */
  @Post(':id/reject')
  @Roles('MANAGER', 'ADMIN')
  async rejectRequest(
    @Param('id') id: string,
    @Body() dto: RejectRequestDto,
    @Request() req: any,
  ): Promise<RequestResponseDto> {
    this.logger.log(`POST /requests/${id}/reject - User: ${req.user.sub}, Role: ${req.user.role}`);

    const rejected = await this.requestService.rejectRequest(
      id,
      req.user.sub,
      req.user.role as ActorRole,
      dto.reason,
    );

    return this.mapToResponseDto(rejected);
  }

  /**
   * POST /api/v1/requests/:id/cancel
   * Cancel a DRAFT or PENDING request
   * Access: EMPLOYEE (own), MANAGER, ADMIN
   * Requirements: 11.7
   */
  @Post(':id/cancel')
  @Roles('EMPLOYEE', 'MANAGER', 'ADMIN')
  async cancelRequest(@Param('id') id: string, @Request() req: any): Promise<RequestResponseDto> {
    this.logger.log(`POST /requests/${id}/cancel - User: ${req.user.sub}, Role: ${req.user.role}`);

    const cancelled = await this.requestService.cancelRequest(
      id,
      req.user.sub,
      req.user.role as ActorRole,
    );

    return this.mapToResponseDto(cancelled);
  }

  private mapToResponseDto(request: TimeOffRequest): RequestResponseDto {
    return {
      id: request.id,
      employeeId: request.employeeId,
      managerId: request.managerId,
      startDate: request.startDate.toISOString().split('T')[0],
      endDate: request.endDate.toISOString().split('T')[0],
      hoursRequested: request.hoursRequested,
      status: request.status,
      rejectionReason: request.rejectionReason,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      submittedAt: request.submittedAt?.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString(),
      version: request.version,
    };
  }
}
