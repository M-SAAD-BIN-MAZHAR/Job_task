import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncCheckpoint } from '../entities/sync-checkpoint.entity';

@Injectable()
export class SyncRepository {
  constructor(
    @InjectRepository(SyncCheckpoint)
    private readonly repo: Repository<SyncCheckpoint>,
  ) {}

  async create(data: Partial<SyncCheckpoint>): Promise<SyncCheckpoint> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async save(entity: SyncCheckpoint): Promise<SyncCheckpoint> {
    return this.repo.save(entity);
  }

  async findLatest(): Promise<SyncCheckpoint | null> {
    return this.repo.findOne({ order: { startedAt: 'DESC' } });
  }
}
