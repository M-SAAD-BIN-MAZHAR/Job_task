import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';

export type RequestStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

@Entity('time_off_requests')
@Index('IDX_REQUEST_EMPLOYEE_STATUS', ['employeeId', 'status'])
@Index('IDX_REQUEST_MANAGER_STATUS', ['managerId', 'status'])
@Index('IDX_REQUEST_STATUS_CREATED', ['status', 'createdAt'])
@Index('IDX_REQUEST_EMPLOYEE_DATES', ['employeeId', 'startDate', 'endDate'])
export class TimeOffRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  employeeId: string;

  @Column()
  managerId: string;

  @Column('date')
  startDate: Date;

  @Column('date')
  endDate: Date;

  @Column('decimal', { precision: 10, scale: 2 })
  hoursRequested: number;

  @Column({
    type: 'varchar',
    length: 20,
  })
  status: RequestStatus;

  @Column({ nullable: true, type: 'text' })
  rejectionReason?: string;

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  submittedAt?: Date;

  @Column({ nullable: true, type: 'datetime' })
  resolvedAt?: Date;

  @Column({ nullable: true })
  idempotencyKey?: string;

  @VersionColumn()
  version: number;
}
