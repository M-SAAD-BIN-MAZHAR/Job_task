import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { OutboxEvent, OutboxStatus } from './outbox-event.entity';

@Injectable()
export class OutboxRepository {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly repo: Repository<OutboxEvent>,
  ) {}

  async create(data: Partial<OutboxEvent>): Promise<OutboxEvent> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findPending(): Promise<OutboxEvent[]> {
    return this.repo.find({
      where: { status: 'PENDING' },
      order: { createdAt: 'ASC' },
    });
  }

  async findByRequestId(requestId: string): Promise<OutboxEvent | null> {
    return this.repo.findOne({ where: { requestId } });
  }

  async findOne(id: string): Promise<OutboxEvent | null> {
    return this.repo.findOne({ where: { id } });
  }

  async save(entity: OutboxEvent): Promise<OutboxEvent> {
    return this.repo.save(entity);
  }

  async countPending(): Promise<number> {
    return this.repo.count({ where: { status: 'PENDING' } });
  }

  async updateStatus(
    id: string,
    status: OutboxStatus,
    extra?: Partial<OutboxEvent>,
  ): Promise<void> {
    await this.repo.update(id, { status, ...extra });
  }
}
