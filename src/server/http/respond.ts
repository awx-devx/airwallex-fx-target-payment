import { errorEnvelopeSchema, type ApiErrorCode, type FieldError } from '@/contracts/airwallex';
import { AirwallexError, toApiError } from '@/server/adapters/airwallex/errors';
import { ServiceError } from '@/server/services/errors';
import { InvalidStateError } from '@/server/domain/stateMachine';
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
  if (error instanceof ServiceError) {
    return errorResponse(error.code, error.message, error.status, error.fieldErrors);
  }
  if (error instanceof InvalidStateError) return errorResponse('INVALID_STATE', error.message, 409);
  if (error instanceof AirwallexError) {
    const api = toApiError(error);
    const status = error.status >= 400 && error.status < 600 ? error.status : 502;
    return json({ error: api }, status);
  }
  throw error;
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
