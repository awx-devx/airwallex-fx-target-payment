import { errorEnvelopeSchema, type ApiErrorCode, type FieldError } from '@/contracts/airwallex';
import { AirwallexError, toApiError } from '@/server/adapters/airwallex/errors';
import { InvalidStateError } from '@/server/domain/stateMachine';
import { getLogger } from '@/server/logging/logger';
import { ServiceError } from '@/server/services/errors';
import type { z } from 'zod';

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  fieldErrors?: FieldError[],
): Response {
  const body = errorEnvelopeSchema.parse({
    error: {
      code,
      message,
      ...(fieldErrors && fieldErrors.length > 0 ? { fieldErrors } : {}),
    },
  });
  return json(body, status);
}

export function failureResponse(error: unknown): Response {
  const service = unwrapService(error);
  if (service) return errorResponse(service.code, service.message, service.status, service.fieldErrors);
  if (error instanceof InvalidStateError) return errorResponse('INVALID_STATE', error.message, 409);
  if (error instanceof AirwallexError) {
    const api = toApiError(error);
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    return json({ error: api }, status);
  }
  getLogger().error({ err: error }, 'unhandled request error');
  if (isDatabaseDown(error)) {
    return errorResponse('AIRWALLEX_UNAVAILABLE', 'The database is unavailable', 503);
  }
  return errorResponse('AIRWALLEX_UNAVAILABLE', 'The server could not complete that request', 500);
}

function unwrapService(error: unknown): ServiceError | null {
  if (error instanceof ServiceError) return error;
  if (error && typeof error === 'object' && 'cause' in error) {
    return unwrapService(error.cause);
  }
  return null;
}

function isDatabaseDown(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  if (/Mongo|Mongoose/.test(name)) return true;
  if ('cause' in error) return isDatabaseDown(error.cause);
  return false;
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw invalidBody('Request body must be JSON');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw invalidBody(parsed.error.issues[0]?.message ?? 'Invalid request');
  }
  return parsed.data;
}

function invalidBody(message: string): ServiceError {
  return new ServiceError('VALIDATION_FAILED', message, 400);
}
