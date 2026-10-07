import { parseAirwallexJson } from '@/server/adapters/airwallex/json';
import { mapTransfer } from '@/server/adapters/airwallex/mappers';
import { isRecord } from '@/server/adapters/airwallex/values';
import {
  knownTransferStatus,
  readWebhook,
  webhookEventFromPayload,
  WebhookVerificationError,
  type AirwallexWebhookEvent,
} from '@/server/adapters/airwallex/webhooks';
import { parseInstant, type Clock } from '@/server/adapters/clock';
import { Execution, WebhookEvent } from '@/server/db/models';
import type { Env } from '@/server/env';
import { getLogger } from '@/server/logging/logger';
import { enqueueWebhook } from '@/server/queue/work';
import { invalidateBalanceCache } from '@/server/services/balanceCache';
import { applyTransferStatus } from '@/server/services/executionStatus';
import type { EventPublisher } from '@/server/services/transitionBill';

export async function receiveWebhook(input: {
  env: Env;
  clock: Clock;
  rawBody: string;
  signature: string;
  timestamp: string;
}): Promise<void> {
  if (!input.env.AIRWALLEX_WEBHOOK_SECRET) {
    throw new WebhookVerificationError('Webhook secret is not set');
  }
  const event = readWebhook({
    secret: input.env.AIRWALLEX_WEBHOOK_SECRET,
    rawBody: input.rawBody,
    signature: input.signature,
    timestamp: input.timestamp,
    now: input.clock.now(),
  });
  let payload: unknown;
  try {
    payload = parseAirwallexJson(input.rawBody);
  } catch {
    throw new WebhookVerificationError('Webhook body is not JSON');
  }
  try {
    await WebhookEvent.create({
      _id: event.id,
      name: event.name,
      // Deposit and global-account events omit created_at. The receive time stands in.
      createdAt: event.createdAt
        ? parseInstant(event.createdAt)
        : input.clock.now(),
      receivedAt: input.clock.now(),
      payload,
    });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  await enqueueWebhook(input.env.REDIS_URL, event.id);
}

export async function processWebhook(input: {
  env: Env;
  clock: Clock;
  eventId: string;
  publisher?: EventPublisher;
  demoMode: boolean;
}): Promise<void> {
  const stored = await WebhookEvent.findById(input.eventId);
  if (!stored || stored.processedAt) return;
  try {
    const event = eventFrom(stored);
    if (
      event.version !== undefined &&
      event.version !== input.env.AIRWALLEX_API_VERSION
    ) {
      getLogger().warn(
        { eventId: event.id, version: event.version },
        'webhook version does not match AIRWALLEX_API_VERSION',
      );
    }
    await dispatch(input, event);
    stored.processedAt = input.clock.now();
    stored.error = undefined;
    await stored.save();
  } catch (error) {
    stored.error =
      error instanceof Error ? error.message : 'Webhook processing failed';
    await stored.save();
    throw error;
  }
}

async function dispatch(
  input: {
    env: Env;
    clock: Clock;
    publisher?: EventPublisher;
    demoMode: boolean;
  },
  event: AirwallexWebhookEvent,
): Promise<void> {
  if (event.name.startsWith('payout.transfer.')) {
    await applyTransferEvent(input, event);
    return;
  }
  if (event.name === 'deposit.settled' || event.name === 'deposit.reversed') {
    await invalidateBalanceCache(input.env.REDIS_URL);
    return;
  }
  if (event.name.startsWith('conversion.')) {
    getLogger().info(
      { name: event.name },
      'conversion webhook is not a transfer',
    );
  }
}

async function applyTransferEvent(
  input: {
    clock: Clock;
    publisher?: EventPublisher;
    demoMode: boolean;
  },
  event: AirwallexWebhookEvent,
): Promise<void> {
  const object = event.object;
  if (!isRecord(object)) return;
  const transferId = typeof object.id === 'string' ? object.id : undefined;
  const requestId =
    typeof object.request_id === 'string' ? object.request_id : undefined;
  if (requestId?.startsWith('sn:')) return;
  const metadata = isRecord(object.metadata) ? object.metadata : undefined;
  const billId =
    metadata && typeof metadata.bill_id === 'string'
      ? metadata.bill_id
      : undefined;
  const byTransfer = transferId
    ? await Execution.findOne({ airwallexTransferId: transferId })
    : null;
  const byRequest = requestId ? await Execution.findOne({ requestId }) : null;
  const byBill = billId
    ? await Execution.findOne({ billId, active: true })
    : null;
  const execution =
    byTransfer ??
    byRequest ??
    (byBill &&
    (!byBill.airwallexTransferId || byBill.airwallexTransferId === transferId)
      ? byBill
      : null);
  if (!execution) {
    if (requestId?.startsWith('tr:')) {
      throw new Error('webhook arrived before the transfer was stored');
    }
    getLogger().info(
      { transferId, name: event.name },
      'webhook transfer has no execution',
    );
    return;
  }
  if (!knownTransferStatus(object)) {
    getLogger().warn(
      { name: event.name, transferId, status: object.status },
      'webhook transfer status is not applied',
    );
    return;
  }
  const summary = mapTransfer(object, execution.mode);
  await applyTransferStatus({
    summary,
    clock: input.clock,
    demoMode: input.demoMode,
    actor: 'airwallex',
    publisher: input.publisher,
    executionId: String(execution._id),
  });
}

function eventFrom(stored: { payload: unknown }): AirwallexWebhookEvent {
  try {
    return webhookEventFromPayload(stored.payload);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      throw new Error('Stored webhook is missing data');
    }
    throw error;
  }
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: number }).code === 11000
  );
}
