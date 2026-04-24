import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';

@Entity('balance_records')
export class BalanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  employeeId: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  availableHours: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  accruedHours: number;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  usedHours: number;

  @Column({ type: 'datetime' })
  lastSyncedAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;

  @VersionColumn()
  version: number;

  get isStale(): boolean {
    const threshold = parseInt(process.env.BALANCE_STALE_THRESHOLD_MS || '300000', 10);
    return Date.now() - new Date(this.lastSyncedAt).getTime() > threshold;
  }
}
