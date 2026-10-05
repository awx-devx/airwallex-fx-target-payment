import { errorEnvelopeSchema, type ApiErrorCode } from '@/contracts/airwallex';
import { DataSourceError } from '@/contracts/data-source';
import type { z } from 'zod';

const FALLBACK: Record<number, ApiErrorCode> = {
  404: 'NOT_FOUND',
  409: 'INVALID_STATE',
  429: 'RATE_LIMITED',
};

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = errorEnvelopeSchema.safeParse(body);
    if (envelope.success) throw new DataSourceError(response.status, envelope.data.error);
    throw new DataSourceError(response.status, {
      code: FALLBACK[response.status] ?? (response.status >= 500 ? 'AIRWALLEX_UNAVAILABLE' : 'AIRWALLEX_ERROR'),
      message: response.statusText || 'Request failed',
    });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new DataSourceError(502, {
      code: 'AIRWALLEX_ERROR',
      message: 'Response did not match the contract',
    });
  }
  return parsed.data;
}

export function apiPost(path: string, body?: unknown): RequestInit {
  if (body === undefined) return { method: 'POST' };
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
