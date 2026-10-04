import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseAirwallexJson } from '@/server/adapters/airwallex/json';
import { toIsoUtc } from '@/server/adapters/airwallex/time';
import { isRecord, requiredString } from '@/server/adapters/airwallex/values';

export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

export interface AirwallexWebhookEvent {
  id: string;
  name: string;
  accountId: string;
  createdAt: string;
  version: string;
  object: unknown;
}

export function webhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}${rawBody}`)
    .digest('hex');
}

/**
 * HMAC-SHA256(secret, x-timestamp + rawBody), compared in constant time.
 * `x-timestamp` is Unix milliseconds. Reject when it is more than 5 minutes
 * from `now`.
 */
export function verifyWebhookSignature(input: {
  secret: string;
  rawBody: string;
  signature: string;
  timestamp: string;
  now: Date;
  toleranceMs?: number;
}): void {
  const expected = webhookSignature(
    input.secret,
    input.timestamp,
    input.rawBody,
  );
  if (!constantTimeEqual(expected, input.signature.trim().toLowerCase())) {
    throw new WebhookVerificationError('Webhook signature does not match');
  }
  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) {
    throw new WebhookVerificationError('Webhook timestamp is not a number');
  }
  const skew = Math.abs(input.now.getTime() - sent);
  if (skew > (input.toleranceMs ?? WEBHOOK_TOLERANCE_MS)) {
    throw new WebhookVerificationError(
      'Webhook timestamp is outside the tolerance',
    );
  }
}

export function parseWebhookEvent(rawBody: string): AirwallexWebhookEvent {
  let payload: unknown;
  try {
    payload = parseAirwallexJson(rawBody);
  } catch {
    throw new WebhookVerificationError('Webhook body is not JSON');
  }
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new WebhookVerificationError('Webhook envelope is missing data');
  }
  return {
    id: requiredString(payload, 'id'),
    name: requiredString(payload, 'name'),
    accountId: requiredString(payload, 'account_id'),
    createdAt: toIsoUtc(requiredString(payload, 'created_at')),
    version: requiredString(payload, 'version'),
    object: payload.data.object,
  };
}

export function readWebhook(input: {
  secret: string;
  rawBody: string;
  signature: string;
  timestamp: string;
  now: Date;
  toleranceMs?: number;
}): AirwallexWebhookEvent {
  verifyWebhookSignature(input);
  return parseWebhookEvent(input.rawBody);
}

function constantTimeEqual(expected: string, actual: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
