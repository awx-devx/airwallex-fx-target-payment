import type { ApiErrorCode, FieldError } from '@/contracts/airwallex';

export class ServiceError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
    readonly fieldErrors?: FieldError[],
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function notFound(message = 'Bill not found'): ServiceError {
  return new ServiceError('NOT_FOUND', message, 404);
}

export function invalid(message: string): ServiceError {
  return new ServiceError('VALIDATION_FAILED', message, 400);
}
