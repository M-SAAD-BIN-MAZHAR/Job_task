import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type AuditOperationType =
  | 'REQUEST_CREATED'
  | 'REQUEST_SUBMITTED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_CANCELLED'
  | 'BALANCE_UPDATED'
  | 'SAGA_STARTED'
  | 'SAGA_COMPLETED'
  | 'SAGA_FAILED'
  | 'SAGA_ROLLED_BACK';

export type ActorRole = 'EMPLOYEE' | 'MANAGER' | 'ADMIN' | 'SYSTEM';

@Entity('audit_logs')
@Index('IDX_AUDIT_ACTOR_TIMESTAMP', ['actorId', 'timestamp'])
@Index('IDX_AUDIT_ENTITY_TIMESTAMP', ['entityId', 'timestamp'])
@Index('IDX_AUDIT_OPERATION_TIMESTAMP', ['operationType', 'timestamp'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  operationType: AuditOperationType;

  @Column()
  @Index()
  actorId: string;

  @Column({ type: 'varchar', length: 20 })
  actorRole: ActorRole;

  @Column({ nullable: true })
  @Index()
  entityId?: string;

  @Column({ nullable: true })
  entityType?: string;

  @Column({ type: 'simple-json', nullable: true })
  previousState?: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  newState?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @CreateDateColumn({ type: 'datetime' })
  @Index()
  timestamp: Date;

  @Column({ nullable: true })
  correlationId?: string;
}
