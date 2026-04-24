import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type LedgerOperation = 'DEBIT' | 'CREDIT';
export type LedgerSource = 'APPROVAL' | 'ROLLBACK' | 'HCM_SYNC' | 'WEBHOOK' | 'RECONCILIATION';

@Entity('ledger_entries')
@Index('IDX_LEDGER_EMPLOYEE_CREATED', ['employeeId', 'createdAt'])
@Index('IDX_LEDGER_EMPLOYEE_SOURCE', ['employeeId', 'source'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  employeeId: string;

  @Column({ type: 'varchar', length: 10 })
  operation: LedgerOperation;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 20 })
  source: LedgerSource;

  @Column({ nullable: true })
  @Index()
  requestId?: string;

  @Column({ nullable: true })
  syncCheckpointId?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @CreateDateColumn({ type: 'datetime' })
  @Index()
  createdAt: Date;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;
}
