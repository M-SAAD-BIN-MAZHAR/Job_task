import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type SyncCheckpointStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface DriftDetail {
  employeeId: string;
  localBalance: number;
  hcmBalance: number;
  difference: number;
}

@Entity('sync_checkpoints')
@Index('IDX_SYNC_STATUS_STARTED', ['status', 'startedAt'])
export class SyncCheckpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ type: 'datetime' })
  startedAt: Date;

  @Column({ nullable: true, type: 'datetime' })
  completedAt?: Date;

  @Column({ type: 'int', default: 0 })
  totalEmployees: number;

  @Column({ type: 'int', default: 0 })
  processedEmployees: number;

  @Column({ type: 'int', default: 0 })
  driftDetectedCount: number;

  @Column({ type: 'varchar', length: 20 })
  status: SyncCheckpointStatus;

  @Column({ type: 'simple-json', nullable: true })
  driftDetails?: DriftDetail[];
}
