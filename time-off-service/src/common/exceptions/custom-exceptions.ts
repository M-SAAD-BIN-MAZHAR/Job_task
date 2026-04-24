import { HttpException, HttpStatus } from '@nestjs/common';

export class TimeOffException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message }, status);
  }
}

export class InvalidStateTransitionException extends TimeOffException {
  constructor(message: string) {
    super('INVALID_STATE_TRANSITION', message, HttpStatus.CONFLICT);
  }
}

export class InsufficientBalanceException extends TimeOffException {
  constructor(message: string) {
    super('INSUFFICIENT_BALANCE', message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class HcmUnavailableException extends TimeOffException {
  constructor(message: string) {
    super('HCM_UNAVAILABLE', message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export class HcmVerificationFailedException extends TimeOffException {
  constructor(message: string) {
    super('HCM_VERIFICATION_FAILED', message, HttpStatus.BAD_GATEWAY);
  }
}

export class ConcurrentModificationException extends TimeOffException {
  constructor(message: string) {
    super('CONCURRENT_MODIFICATION', message, HttpStatus.CONFLICT);
  }
}

export class IdempotencyConflictException extends TimeOffException {
  constructor(message: string) {
    super('IDEMPOTENCY_CONFLICT', message, HttpStatus.CONFLICT);
  }
}

export class EntityNotFoundException extends TimeOffException {
  constructor(entityName: string, id: string) {
    super('ENTITY_NOT_FOUND', `${entityName} with id ${id} not found`, HttpStatus.NOT_FOUND);
  }
}
