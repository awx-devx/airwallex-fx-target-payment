import type { AppLogger } from '@/server/logging/logger';
import { getLogger } from '@/server/logging/logger';

export const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdFrom(headers: Headers): string {
  const existing = headers.get(REQUEST_ID_HEADER)?.trim();
  if (existing) return existing;
  return crypto.randomUUID();
}

export function requestLogger(
  headers: Headers,
  logger: AppLogger = getLogger(),
): AppLogger {
  return logger.child({ request_id: requestIdFrom(headers) });
}
