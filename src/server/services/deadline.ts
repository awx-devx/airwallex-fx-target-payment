import type { QuoteSummary } from '@/contracts/airwallex';
import { decimalString } from '@/contracts/money';
import { parseInstant, type Clock } from '@/server/adapters/clock';
import type { QuoteLock } from '@/server/adapters/quotes';
import { fromDecimal128, toDecimal128 } from '@/server/db/decimal';
import { Bill, BillEvent, Quote } from '@/server/db/models';
import type { Env } from '@/server/env';
import { enqueueExecution } from '@/server/queue/work';
import { notificationFor } from '@/server/services/notify';
import { releaseSafetyNet, type SafetyNetGateway } from '@/server/services/safetyNet';
import { applyTransition, type EventPublisher } from '@/server/services/transitionBill';

export interface DeadlineDeps {
  env: Env;
  clock: Clock;
  quotes: QuoteLock;
  publisher?: EventPublisher;
  demoMode: boolean;
  safetyNet?: SafetyNetGateway | null;
}

interface PayableBill {
  _id: { toString(): string };
  state: string;
  billCurrency: string;
  billAmount: { toString(): string };
  homeCurrency: string;
  safetyNet?: { transferId?: string } | null;
}

/** Lock a one-minute quote and pay a watching or paused bill at the cutoff. */
export async function runDeadlineJob(input: DeadlineDeps & { billId: string }): Promise<void> {
  const bill = await Bill.findById(input.billId).lean<PayableBill | null>();
  if (!bill) return;
  if (bill.state === 'EXECUTING') {
    await requeueDeadline(input.env, input.billId);
    return;
  }
  if (bill.state !== 'WATCHING' && bill.state !== 'PAUSED') return;
  const quote = await input.quotes.lock({
    buy: bill.billCurrency,
    sell: bill.homeCurrency,
    buyAmount: money(bill.billAmount),
    validity: 'MIN_1',
  });
  if (parseInstant(quote.validToAt).getTime() <= input.clock.now().getTime()) {
    throw new Error('Quote expired before the transfer was created');
  }
  await storeQuote(String(bill._id), bill.billCurrency, bill.homeCurrency, quote);
  await releaseSafetyNet(input.env, bill.safetyNet?.transferId, input.safetyNet);
  await applyTransition({
    billId: input.billId,
    event: 'DEADLINE',
    clock: input.clock,
    actor: 'system',
    auditType: 'AUTOSETTLE',
    payload: { mode: 'DEADLINE', quoteId: quote.airwallexQuoteId, price: quote.price },
    demoMode: input.demoMode,
    publisher: input.publisher,
    patch: { 'timers.autosettleFiredAt': input.clock.now(), insufficientBalance: false },
  });
  await enqueueExecution(input.env.REDIS_URL, input.billId, 1, 'DEADLINE');
}

/** The cutoff was already past at arming. The bill is in EXECUTING; record the payment and enqueue it. */
export async function notePastDeadlinePayment(input: {
  env: Env;
  clock: Clock;
  billId: string;
  buy: string;
  sell: string;
  quote: QuoteSummary;
  publisher?: EventPublisher;
}): Promise<void> {
  await storeQuote(input.billId, input.buy, input.sell, input.quote);
  const at = input.clock.now();
  const audit = {
    ts: at,
    type: 'AUTOSETTLE' as const,
    actor: 'system',
    payload: { mode: 'DEADLINE', quoteId: input.quote.airwallexQuoteId, price: input.quote.price },
  };
  await Bill.updateOne({ _id: input.billId }, { $push: { recentEvents: { $each: [audit], $slice: -20 } } });
  await BillEvent.create({ billId: input.billId, ...audit });
  const notification = notificationFor({ billId: input.billId, auditType: 'AUTOSETTLE', at, payload: audit.payload });
  if (notification && input.publisher) await input.publisher.publish(notification);
  await enqueueExecution(input.env.REDIS_URL, input.billId, 1, 'DEADLINE');
}

async function requeueDeadline(env: Env, billId: string): Promise<void> {
  const quote = await Quote.findOne({ billId }).sort({ validFromAt: -1 }).lean();
  if (quote?.purpose !== 'DEADLINE' && quote?.purpose !== 'AUTOSETTLE') return;
  await enqueueExecution(env.REDIS_URL, billId, 1, 'DEADLINE');
}

async function storeQuote(
  billId: string,
  buy: string,
  sell: string,
  quote: QuoteSummary,
): Promise<void> {
  await Quote.create({
    billId,
    airwallexQuoteId: quote.airwallexQuoteId,
    purpose: 'DEADLINE',
    validity: quote.validity,
    usage: quote.usage,
    currencyPair: `${buy}${sell}`,
    conversionDate: parseInstant(`${quote.conversionDate}T00:00:00.000Z`),
    price: toDecimal128(quote.price),
    clientRate: toDecimal128(quote.clientRate),
    ...(quote.midPrice ? { midRate: toDecimal128(quote.midPrice) } : {}),
    buyAmount: toDecimal128(quote.buyAmount),
    sellAmount: toDecimal128(quote.sellAmount),
    validFromAt: parseInstant(quote.validFromAt),
    validToAt: parseInstant(quote.validToAt),
    raw: {},
  });
}

function money(value: { toString(): string }): string {
  return decimalString(fromDecimal128(value));
}
