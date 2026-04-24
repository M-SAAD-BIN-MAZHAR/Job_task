import { RequestStatus } from '../entities/time-off-request.entity';

export class RequestResponseDto {
  id: string;
  employeeId: string;
  managerId: string;
  startDate: string;
  endDate: string;
  hoursRequested: number;
  status: RequestStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  resolvedAt?: string;
  version: number;
}

export class PaginatedRequestResponseDto {
  data: RequestResponseDto[];
  total: number;
  page: number;
  limit: number;
}
