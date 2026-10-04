import { errorEnvelopeSchema, type ApiErrorCode } from '@/contracts/airwallex';
import { ServiceError } from '@/server/services/errors';
import { InvalidStateError } from '@/server/domain/stateMachine';
import type { z } from 'zod';

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function errorResponse(code: ApiErrorCode, message: string, status: number): Response {
  const body = errorEnvelopeSchema.parse({ error: { code, message } });
  return json(body, status);
}

export function failureResponse(error: unknown): Response {
  if (error instanceof ServiceError) return errorResponse(error.code, error.message, error.status);
  if (error instanceof InvalidStateError) return errorResponse('INVALID_STATE', error.message, 409);
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
