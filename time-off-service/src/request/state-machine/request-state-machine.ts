import { RequestStatus } from '../entities/time-off-request.entity';
import { InvalidStateTransitionException } from '../../common/exceptions/custom-exceptions';

export const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: ['PENDING', 'CANCELLED'],
  PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function validateTransition(from: RequestStatus, to: RequestStatus): void {
  const allowed = VALID_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidStateTransitionException(
      `Cannot transition from ${from} to ${to}. Valid transitions from ${from}: [${allowed.join(', ') || 'none'}]`,
    );
  }
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}
