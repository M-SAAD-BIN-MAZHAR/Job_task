import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type OutboxStatus = 'PENDING' | 'DELIVERED' | 'FAILED';

export interface HCMApprovalPayload {
  employeeId: string;
  startDate: string;
  endDate: string;
  hoursRequested: number;
  requestId: string;
}

@Entity('outbox_events')
@Index('IDX_OUTBOX_STATUS_CREATED', ['status', 'createdAt'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  requestId: string;

  @Column({ type: 'varchar', length: 20 })
  @Index()
  status: OutboxStatus;

  @Column({ type: 'simple-json' })
  payload: HCMApprovalPayload;

  @CreateDateColumn({ type: 'datetime' })
  @Index()
  createdAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  deliveredAt?: Date;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ nullable: true })
  idempotencyKey?: string;
}
