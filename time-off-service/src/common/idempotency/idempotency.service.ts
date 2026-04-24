import { Injectable } from '@nestjs/common';
import { IdempotencyRepository } from './idempotency.repository';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class IdempotencyService {
  constructor(private readonly idempotencyRepository: IdempotencyRepository) {}

  async withIdempotency<T>(key: string | undefined, operation: () => Promise<T>): Promise<T> {
    // If no key provided, execute operation normally
    if (!key) return operation();

    // Check for existing cached response
    const existing = await this.idempotencyRepository.findValid(key);
    if (existing) {
      return existing.response as T;
    }

    // Execute operation and cache result
    const result = await operation();

    try {
      await this.idempotencyRepository.save(key, result);
    } catch (error: any) {
      // If another concurrent request already saved this key, that's fine
      // The important thing is that the operation was executed and we have a result
      if (!error.message?.includes('UNIQUE constraint') && error.code !== 'SQLITE_CONSTRAINT') {
        throw error;
      }
    }

    return result;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<void> {
    await this.idempotencyRepository.deleteExpired();
  }
}
