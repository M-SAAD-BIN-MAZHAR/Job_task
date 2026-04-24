import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditOperationType, ActorRole } from '../entities/audit-log.entity';

export interface AuditFilters {
  actorId?: string;
  operationType?: AuditOperationType;
  entityId?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AuditRepository {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async create(data: Partial<AuditLog>): Promise<AuditLog> {
    const entry = this.repo.create(data);
    return this.repo.save(entry);
  }

  async findMany(filters: AuditFilters): Promise<AuditLog[]> {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.timestamp', 'DESC');

    if (filters.actorId) qb.andWhere('a.actorId = :actorId', { actorId: filters.actorId });
    if (filters.operationType) qb.andWhere('a.operationType = :op', { op: filters.operationType });
    if (filters.entityId) qb.andWhere('a.entityId = :entityId', { entityId: filters.entityId });
    if (filters.entityType)
      qb.andWhere('a.entityType = :entityType', { entityType: filters.entityType });
    if (filters.from) qb.andWhere('a.timestamp >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('a.timestamp <= :to', { to: filters.to });

    return qb.getMany();
  }
}
