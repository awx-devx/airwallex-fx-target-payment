import { executionSummarySchema, type ExecutionSummary, type TransferReason } from '@/contracts/airwallex';
import { D, decimalString } from '@/contracts/money';
import { AirwallexError } from '@/server/adapters/airwallex/errors';
import type { CurrentBalance } from '@/server/adapters/balances';
import type { Clock } from '@/server/adapters/clock';
import { transferRequestId } from '@/server/adapters/airwallex/requestIds';
import type { TransferGateway } from '@/server/adapters/transfers';
import { fromDecimal128 } from '@/server/db/decimal';
import { Beneficiary, Bill, Execution, Quote } from '@/server/db/models';
import type { Env } from '@/server/env';
import type { ExecutionPayload } from '@/server/queue';
import { enqueueQuoteRetry } from '@/server/queue/work';
import { ServiceError } from '@/server/services/errors';
import { applyTransferStatus } from '@/server/services/executionStatus';
import { applyTransition, type EventPublisher } from '@/server/services/transitionBill';
import mongoose from 'mongoose';

export class RetryableExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableExecutionError';
  }
}

interface OpenBill {
  _id: { toString(): string };
  state: string;
  version: number;
  billCurrency: string;
  billAmount: { toString(): string };
  homeCurrency: string;
  beneficiaryId?: { toString(): string } | null;
  transferMethod: ExecutionSummary['transferMethod'];
  transferReason: TransferReason;
  reference?: string | null;
  invoiceNumber: string;
  strategy?: { feeEstimate?: { toString(): string } } | null;
}

/** The next `tr:{billId}:{attempt}`. A terminal failure is the only thing that advances it. */
export async function nextTransferAttempt(billId: string): Promise<number> {
  if (!mongoose.isValidObjectId(billId)) return 1;
  const latest = await Execution.findOne({ billId }).sort({ attempt: -1 }).lean();
  if (!latest) return 1;
  if (latest.active) return latest.attempt;
  if (latest.transferStatus === 'FAILED' || latest.failure) return latest.attempt + 1;
  return latest.attempt;
}

export async function runExecution(input: {
  env: Env;
  clock: Clock;
  balances: { getBalances(): Promise<CurrentBalance[]> };
  gateway: TransferGateway;
  publisher?: EventPublisher;
  demoMode: boolean;
  billId: string;
  attempt: number;
  mode: ExecutionPayload['mode'];
}): Promise<void> {
  const bill = await Bill.findById(input.billId).lean<OpenBill | null>();
  if (!bill || bill.state !== 'EXECUTING') return;
  const requestId = transferRequestId(input.billId, input.attempt);
  const existing = await Execution.findOne({ requestId });
  if (existing?.airwallexTransferId && existing.transferStatus) {
    const summary = summaryFrom(existing.raw);
    if (summary) {
      await applyTransferStatus({
        summary,
        clock: input.clock,
        demoMode: input.demoMode,
        actor: 'system',
        publisher: input.publisher,
        executionId: String(existing._id),
      });
    }
    return;
  }
  const quote = await Quote.findOne({ billId: bill._id }).sort({ validFromAt: -1 }).lean();
  if (!quote) throw new RetryableExecutionError('The locked quote is missing');
  const quotePrice = money(quote.price);
  const sellAmount = money(quote.sellAmount);
  const buyAmount = money(quote.buyAmount);
  if (quote.validToAt.getTime() <= input.clock.now().getTime()) {
    await release(input, bill, existing, 'quote_expired');
    return;
  }
  const fee = bill.strategy?.feeEstimate ? money(bill.strategy.feeEstimate) : '0';
  const rows = await input.balances.getBalances();
  const available = rows.find((row) => row.currency === bill.homeCurrency)?.available ?? '0';
  if (D(available).lt(D(sellAmount).plus(fee))) {
    if (input.mode === 'DEADLINE') {
      await Bill.updateOne({ _id: bill._id, state: 'EXECUTING' }, { $set: { insufficientBalance: true } });
      throw new RetryableExecutionError('The home-currency balance does not cover the cutoff payment');
    }
    await release(input, bill, existing, 'balance');
    return;
  }
  const beneficiary = bill.beneficiaryId ? await Beneficiary.findById(bill.beneficiaryId) : null;
  if (!beneficiary) {
    await fail(input, bill, existing, 'Resolve a beneficiary before paying');
    return;
  }
  const body = {
    billId: input.billId,
    attempt: input.attempt,
    beneficiaryId: beneficiary.airwallexBeneficiaryId,
    transferCurrency: bill.billCurrency,
    transferAmount: buyAmount,
    sourceCurrency: bill.homeCurrency,
    sourceAmount: sellAmount,
    rate: quotePrice,
    transferMethod: bill.transferMethod,
    quoteId: quote.airwallexQuoteId,
    reason: bill.transferReason,
    reference: bill.reference || bill.invoiceNumber,
    mode: input.mode,
  };
  if (input.env.PAYMENTS_GATEWAY === 'airwallex') {
    try {
      await input.gateway.validate(body);
    } catch (error) {
      await classify(input, bill, existing, error);
      return;
    }
  }
  const execution = existing ?? (await openExecution(input, requestId));
  if (!execution.active) {
    await Execution.updateOne({ _id: execution._id, active: false }, { $set: { active: true } });
  }
  try {
    const summary = await input.gateway.create(body);
    await applyTransferStatus({
      summary,
      clock: input.clock,
      demoMode: input.demoMode,
      actor: 'system',
      publisher: input.publisher,
      executionId: String(execution._id),
    });
  } catch (error) {
    await classify(input, bill, execution, error);
  }
}

export async function cancelInFlightTransfer(input: {
  env: Env;
  clock: Clock;
  gateway: TransferGateway;
  publisher?: EventPublisher;
  demoMode: boolean;
  billId: string;
}): Promise<void> {
  const bill = await Bill.findById(input.billId);
  if (!bill || bill.state !== 'IN_FLIGHT') {
    throw new ServiceError('INVALID_STATE', 'Only an in-flight transfer can be cancelled here', 409);
  }
  const execution = await Execution.findOne({ billId: bill._id, active: true });
  if (!execution?.airwallexTransferId || !execution.transferStatus) {
    throw new ServiceError('TRANSFER_NOT_CANCELLABLE', 'The transfer cannot be cancelled', 409);
  }
  if (execution.transferStatus === 'SENT' || execution.transferStatus === 'PAID') {
    throw new ServiceError('TRANSFER_NOT_CANCELLABLE', 'Already sent, can\'t be cancelled', 409);
  }
  const summary = await input.gateway.cancel(execution.airwallexTransferId, execution.mode);
  await Execution.updateOne({ _id: execution._id }, { $set: { cancelRequested: true } });
  const stored = summary ?? cancelledSummary(execution, input.clock);
  if (!stored) {
    throw new ServiceError('TRANSFER_NOT_CANCELLABLE', 'The transfer cannot be cancelled', 409);
  }
  await applyTransferStatus({
    summary: stored,
    clock: input.clock,
    demoMode: input.demoMode,
    actor: 'user',
    publisher: input.publisher,
    executionId: String(execution._id),
  });
}

function cancelledSummary(
  execution: { raw?: unknown; mode: ExecutionSummary['mode'] },
  clock: Clock,
): ExecutionSummary | null {
  const summary = summaryFrom(execution.raw);
  if (!summary) return null;
  return { ...summary, status: 'CANCELLED', updatedAt: clock.now().toISOString(), mode: execution.mode };
}

async function openExecution(
  input: { billId: string; attempt: number; mode: ExecutionPayload['mode'] },
  requestId: string,
) {
  try {
    const created = await Execution.create({
      billId: input.billId,
      mode: input.mode,
      attempt: input.attempt,
      requestId,
      active: true,
    });
    await Bill.updateOne({ _id: input.billId, state: 'EXECUTING' }, { $set: { activeExecutionId: created._id } });
    return created;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const raced = await Execution.findOne({ requestId });
    if (!raced) throw error;
    return raced;
  }
}

async function classify(
  input: Parameters<typeof release>[0],
  bill: OpenBill,
  execution: { _id: mongoose.Types.ObjectId; invalidQuoteCount?: number } | null,
  error: unknown,
): Promise<void> {
  if (error instanceof RetryableExecutionError) throw error;
  if (!(error instanceof AirwallexError)) throw error;
  if (error.code === 'quote_expired') {
    await release(input, bill, execution, 'quote_expired');
    return;
  }
  if (error.code === 'quote_id_invalid') {
    const strikes = (execution?.invalidQuoteCount ?? 0) + 1;
    if (execution) {
      await Execution.updateOne({ _id: execution._id }, { $set: { invalidQuoteCount: strikes } });
    }
    if (strikes >= 2) {
      await fail(input, bill, execution, error.message);
      return;
    }
    await release(input, bill, execution, 'quote_id_invalid');
    return;
  }
  if (
    error.code === 'balance_insufficient' ||
    error.code === 'open_position_limit_exceeded' ||
    error.code === 'credit_limit_exceeded'
  ) {
    if (input.mode === 'DEADLINE') throw new RetryableExecutionError(error.message);
    await release(input, bill, execution, 'balance');
    return;
  }
  if (error.status === 429 || error.status >= 500 || error.status === 0 || error.code === 'request_pending') {
    throw new RetryableExecutionError(error.message);
  }
  if (error.code === 'service_unavailable' || error.code === 'network_error') {
    throw new RetryableExecutionError(error.message);
  }
  await fail(input, bill, execution, error.message);
}

async function release(
  input: {
    env: Env;
    clock: Clock;
    publisher?: EventPublisher;
    demoMode: boolean;
    billId: string;
    mode: ExecutionPayload['mode'];
  },
  bill: OpenBill,
  execution: { _id: mongoose.Types.ObjectId } | null,
  reason: 'quote_expired' | 'quote_id_invalid' | 'balance',
): Promise<void> {
  if (execution) {
    await Execution.updateOne({ _id: execution._id }, { $set: { active: false } });
  }
  const current = await Bill.findById(bill._id);
  if (!current || current.state !== 'EXECUTING') return;
  await applyTransition({
    billId: input.billId,
    event: 'RELEASE',
    clock: input.clock,
    actor: 'system',
    auditType: reason === 'balance' ? 'TRANSFER_STATUS' : 'QUOTE_EXPIRED',
    payload: { reason },
    demoMode: input.demoMode,
    publisher: input.publisher,
    patch: {
      insufficientBalance: reason === 'balance',
      ...(input.mode === 'DEADLINE' ? { 'timers.autosettleFiredAt': null } : {}),
    },
  });
  if (reason !== 'balance' && input.mode === 'TARGET') {
    await enqueueQuoteRetry(input.env.REDIS_URL, input.billId);
  }
}

async function fail(
  input: {
    clock: Clock;
    publisher?: EventPublisher;
    demoMode: boolean;
    billId: string;
  },
  bill: OpenBill,
  execution: { _id: mongoose.Types.ObjectId } | null,
  message: string,
): Promise<void> {
  if (execution) {
    await Execution.updateOne(
      { _id: execution._id },
      {
        $set: {
          active: false,
          failure: { message, category: 'SYSTEM' },
        },
      },
    );
  }
  const current = await Bill.findById(bill._id);
  if (!current || current.state !== 'EXECUTING') return;
  await applyTransition({
    billId: input.billId,
    event: 'CREATE_FAILED',
    clock: input.clock,
    actor: 'system',
    auditType: 'FAILED',
    payload: { message },
    demoMode: input.demoMode,
    publisher: input.publisher,
  });
}

function summaryFrom(raw: unknown): ExecutionSummary | null {
  if (!raw || typeof raw !== 'object' || !('summary' in raw)) return null;
  const parsed = executionSummarySchema.safeParse((raw as { summary?: unknown }).summary);
  return parsed.success ? parsed.data : null;
}

function money(value: { toString(): string }): string {
  return decimalString(fromDecimal128(value));
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000;
}
