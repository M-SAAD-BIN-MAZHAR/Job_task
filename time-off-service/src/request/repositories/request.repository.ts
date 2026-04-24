import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions } from 'typeorm';
import { TimeOffRequest, RequestStatus } from '../entities/time-off-request.entity';
import { EntityNotFoundException } from '../../common/exceptions/custom-exceptions';

export interface RequestFilters {
  employeeId?: string;
  managerId?: string;
  status?: RequestStatus;
  startDateFrom?: Date;
  startDateTo?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class RequestRepository {
  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly repo: Repository<TimeOffRequest>,
  ) {}

  async create(data: Partial<TimeOffRequest>): Promise<TimeOffRequest> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<TimeOffRequest | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<TimeOffRequest> {
    const entity = await this.findById(id);
    if (!entity) throw new EntityNotFoundException('TimeOffRequest', id);
    return entity;
  }

  async save(entity: TimeOffRequest): Promise<TimeOffRequest> {
    return this.repo.save(entity);
  }

  async findMany(filters: RequestFilters): Promise<PaginatedResult<TimeOffRequest>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: FindManyOptions<TimeOffRequest>['where'] = {};
    if (filters.employeeId) (where as any).employeeId = filters.employeeId;
    if (filters.managerId) (where as any).managerId = filters.managerId;
    if (filters.status) (where as any).status = filters.status;

    const [data, total] = await this.repo.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  async findByEmployeeAndDateOverlap(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    excludeId?: string,
  ): Promise<TimeOffRequest[]> {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.employeeId = :employeeId', { employeeId })
      .andWhere('r.status NOT IN (:...excluded)', { excluded: ['CANCELLED', 'REJECTED'] })
      .andWhere('r.startDate <= :endDate AND r.endDate >= :startDate', { startDate, endDate });

    if (excludeId) {
      qb.andWhere('r.id != :excludeId', { excludeId });
    }

    return qb.getMany();
  }

  async countByIdempotencyKey(key: string): Promise<number> {
    return this.repo.count({ where: { idempotencyKey: key } });
  }
}
