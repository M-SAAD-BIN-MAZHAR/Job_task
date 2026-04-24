import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { IdempotencyKey } from './idempotency-key.entity';

@Injectable()
export class IdempotencyRepository {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repo: Repository<IdempotencyKey>,
  ) {}

  async findValid(key: string): Promise<IdempotencyKey | null> {
    const result = await this.repo.findOne({
      where: { key },
    });

    // Check if the key has expired
    if (result && new Date(result.expiresAt) <= new Date()) {
      return null;
    }

    return result;
  }

  async save(key: string, response: unknown, ttlMs = 86_400_000): Promise<IdempotencyKey> {
    const expiresAt = new Date(Date.now() + ttlMs);
    const entity = this.repo.create({ key, response, expiresAt });

    try {
      return await this.repo.save(entity);
    } catch (error: any) {
      // Handle race condition where another request already saved this key
      if (error.code === 'SQLITE_CONSTRAINT' || error.message?.includes('UNIQUE constraint')) {
        // Key was already saved by another concurrent request, fetch and return it
        const existing = await this.findValid(key);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async deleteExpired(): Promise<void> {
    await this.repo.delete({ expiresAt: LessThan(new Date()) });
  }
}
