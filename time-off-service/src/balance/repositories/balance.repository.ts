import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceRecord } from '../entities/balance-record.entity';
import { EntityNotFoundException } from '../../common/exceptions/custom-exceptions';

@Injectable()
export class BalanceRepository {
  constructor(
    @InjectRepository(BalanceRecord)
    private readonly repo: Repository<BalanceRecord>,
  ) {}

  async findByEmployee(employeeId: string): Promise<BalanceRecord | null> {
    // Cache balance lookups for 30 seconds (configured in database.config.ts)
    return this.repo.findOne({
      where: { employeeId },
      cache: {
        id: `balance_${employeeId}`,
        milliseconds: 30000, // 30 seconds
      },
    });
  }

  async findByEmployeeOrFail(employeeId: string): Promise<BalanceRecord> {
    const record = await this.findByEmployee(employeeId);
    if (!record) throw new EntityNotFoundException('BalanceRecord', employeeId);
    return record;
  }

  async upsert(employeeId: string, data: Partial<BalanceRecord>): Promise<BalanceRecord> {
    let record = await this.findByEmployee(employeeId);
    if (!record) {
      record = this.repo.create({ employeeId, ...data });
    } else {
      Object.assign(record, data);
    }
    // Clear cache after update
    await this.repo.manager.connection.queryResultCache?.remove([`balance_${employeeId}`]);
    return this.repo.save(record);
  }

  async save(record: BalanceRecord): Promise<BalanceRecord> {
    // Clear cache after save
    await this.repo.manager.connection.queryResultCache?.remove([`balance_${record.employeeId}`]);
    return this.repo.save(record);
  }

  async findAllEmployeeIds(): Promise<string[]> {
    // Cache employee ID list for 5 minutes (changes infrequently)
    const records = await this.repo.find({
      select: ['employeeId'],
      cache: {
        id: 'all_employee_ids',
        milliseconds: 300000, // 5 minutes
      },
    });
    return records.map((r) => r.employeeId);
  }

  async findAll(): Promise<BalanceRecord[]> {
    // Don't cache findAll as it's used for batch operations
    return this.repo.find();
  }
}

