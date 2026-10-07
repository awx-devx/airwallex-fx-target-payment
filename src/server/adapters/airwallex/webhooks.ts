import { createHmac, timingSafeEqual } from 'node:crypto';
import { TRANSFER_STATUSES, type TransferStatus } from '@/contracts/airwallex';
import { parseAirwallexJson } from '@/server/adapters/airwallex/json';
import { toIsoUtc } from '@/server/adapters/airwallex/time';
import {
  isRecord,
  optionalString,
  requiredString,
} from '@/server/adapters/airwallex/values';

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
  /** Omitted by some event families (deposits, Global Accounts). */
  createdAt?: string;
  /** Omitted when the subscription payload has no API version. */
  version?: string;
  object: unknown;
}

const KNOWN_TRANSFER_STATUSES = new Set<string>(TRANSFER_STATUSES);

/**
 * Transfer status we know how to apply. Anything else is ignored: a new
 * Airwallex status must not fail the webhook job.
 */
export function knownTransferStatus(
  object: unknown,
): TransferStatus | undefined {
  if (!isRecord(object) || typeof object.status !== 'string') return undefined;
  return KNOWN_TRANSFER_STATUSES.has(object.status)
    ? (object.status as TransferStatus)
    : undefined;
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
  return webhookEventFromPayload(payload);
}

/**
 * Transfer webhooks put the transfer on `data` (current API versions) or on
 * `data.object` (older examples). Deposit and Global Account events use
 * `accountId` and omit `created_at` and `version`.
 */
export function webhookEventFromPayload(
  payload: unknown,
): AirwallexWebhookEvent {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    throw new WebhookVerificationError('Webhook envelope is missing data');
  }
  const createdAt = optionalString(payload, 'created_at');
  const version = optionalString(payload, 'version');
  const accountId =
    optionalString(payload, 'account_id') ??
    optionalString(payload, 'accountId') ??
    '';
  return {
    id: requiredString(payload, 'id'),
    name: requiredString(payload, 'name'),
    accountId,
    ...(createdAt ? { createdAt: toIsoUtc(createdAt) } : {}),
    ...(version ? { version } : {}),
    object: isRecord(payload.data.object) ? payload.data.object : payload.data,
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
