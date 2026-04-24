import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LedgerEntry, LedgerOperation, LedgerSource } from '../entities/ledger-entry.entity';

export interface LedgerFilters {
  employeeId?: string;
  requestId?: string;
  operation?: LedgerOperation;
  source?: LedgerSource;
  from?: Date;
  to?: Date;
}

@Injectable()
export class LedgerRepository {
  constructor(
    @InjectRepository(LedgerEntry)
    private readonly repo: Repository<LedgerEntry>,
  ) {}

  async create(data: Partial<LedgerEntry>): Promise<LedgerEntry> {
    const entry = this.repo.create(data);
    return this.repo.save(entry);
  }

  async findByEmployee(employeeId: string, filters?: LedgerFilters): Promise<LedgerEntry[]> {
    const qb = this.repo
      .createQueryBuilder('l')
      .where('l.employeeId = :employeeId', { employeeId })
      .orderBy('l.createdAt', 'ASC');

    if (filters?.operation) qb.andWhere('l.operation = :op', { op: filters.operation });
    if (filters?.source) qb.andWhere('l.source = :src', { src: filters.source });
    if (filters?.from) qb.andWhere('l.createdAt >= :from', { from: filters.from });
    if (filters?.to) qb.andWhere('l.createdAt <= :to', { to: filters.to });

    return qb.getMany();
  }

  async findByRequest(requestId: string): Promise<LedgerEntry[]> {
    return this.repo.find({ where: { requestId }, order: { createdAt: 'ASC' } });
  }

  async countByEmployee(employeeId: string): Promise<number> {
    return this.repo.count({ where: { employeeId } });
  }

  async findLatestByEmployee(employeeId: string): Promise<LedgerEntry | null> {
    return this.repo.findOne({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async calculateNetBalance(employeeId: string): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('l')
      .select(`SUM(CASE WHEN l.operation = 'CREDIT' THEN l.amount ELSE -l.amount END)`, 'net')
      .where('l.employeeId = :employeeId', { employeeId })
      .getRawOne<{ net: string }>();

    return parseFloat(result?.net ?? '0');
  }
}
