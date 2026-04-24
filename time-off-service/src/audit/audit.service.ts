import { Injectable } from '@nestjs/common';
import { AuditRepository, AuditFilters } from './repositories/audit.repository';
import { AuditLog, AuditOperationType, ActorRole } from './entities/audit-log.entity';

export interface CreateAuditLogDto {
  operationType: AuditOperationType;
  actorId: string;
  actorRole: ActorRole;
  entityId?: string;
  entityType?: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  reason?: string;
  correlationId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async log(dto: CreateAuditLogDto): Promise<AuditLog> {
    return this.auditRepository.create(dto);
  }

  async findMany(filters: AuditFilters): Promise<AuditLog[]> {
    return this.auditRepository.findMany(filters);
  }
}
