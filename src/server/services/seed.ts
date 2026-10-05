import type { TransferReason } from '@/contracts/airwallex';
import { decimalString, significantPrice } from '@/contracts/money';
import type { BillState } from '@/contracts/bill';
import type { Clock } from '@/server/adapters/clock';
import { currentBalances } from '@/server/adapters/balances';
import { quoteLock } from '@/server/adapters/quotes';
import { scriptedPrice } from '@/server/adapters/demo/store';
import { routingRateSource } from '@/server/adapters/rates';
import { transferGateway } from '@/server/adapters/transfers';
import { toDecimal128 } from '@/server/db/decimal';
import {
  Beneficiary,
  Bill,
  BillDocument,
  BillEvent,
  Execution,
  Quote,
} from '@/server/db/models';
import { accountDate, utcDateOnly } from '@/server/domain/deadline';
import type { Env } from '@/server/env';
import { DEMO_ANCHORS } from '@/mocks/market';
import { addDays } from '@/mocks/generators/dates';
import {
  generateSnapshot,
  GENERATOR_VERSION,
  type BillPlan,
  type ProfileName,
} from '@/mocks/generators/snapshot';
import type { BankDetails } from '@/mocks/generators/bankDetails';
import type { InvoiceTruth } from '@/mocks/generators/invoices';
import {
  billContext,
  eventPublisher,
  pauseBill,
  putStrategy,
  armBill,
  cancelBill,
} from '@/server/services/bills';
import { resolveBeneficiary } from '@/server/services/beneficiaries';
import {
  advanceDemoTransfer,
  startSimulation,
  stopSimulation,
} from '@/server/services/demo';
import { stepDemoSims } from '@/server/services/demoSim';
import { nextTransferAttempt, runExecution } from '@/server/services/execution';
import { invalid, notFound } from '@/server/services/errors';
import { applyTransition } from '@/server/services/transitionBill';
import { payBillNow, runStrategyJob } from '@/server/services/strategy';
import Decimal from 'decimal.js';

/**
 * DEMO-ONLY: curated and generated bills are fictional. The default path uses the mock gateway.
 * PROD: real vendors, live extraction, and no generated seed keys.
 */

export interface SeedResult {
  batchId: string;
  seed: number;
  created: number;
  skipped: number;
  plan: {
    seedKey: string;
    state: BillState;
    currency: string;
    amount: string;
  }[];
}

export async function seedGenerated(input: {
  env: Env;
  clock: Clock;
  profile?: ProfileName;
  seed?: number;
  count?: number;
  currencies?: string[];
  states?: BillState[];
  dryRun?: boolean;
}): Promise<SeedResult> {
  assertSeed(input.env, input.profile ?? 'mixed');
  const seed = input.seed ?? 1;
  const snapshot = generateSnapshot({
    seed,
    profile: input.profile ?? 'mixed',
    asOf: accountDate(input.clock.now(), input.env.AIRWALLEX_ACCOUNT_TZ),
    ...(input.count !== undefined ? { count: input.count } : {}),
    ...(input.currencies ? { currencies: input.currencies } : {}),
    ...(input.states ? { states: input.states } : {}),
    homeCurrency: input.env.HOME_CURRENCY,
  });
  const plan = snapshot.bills.map((bill) => ({
    seedKey: bill.seedKey,
    state: bill.state,
    currency: bill.currency,
    amount: bill.amount,
  }));
  const batchId = `gen:v${GENERATOR_VERSION}:${seed}`;
  if (input.dryRun) return { batchId, seed, created: 0, skipped: 0, plan };
  let created = 0;
  let skipped = 0;
  for (const bill of snapshot.bills) {
    const invoice = snapshot.invoices[bill.invoiceIndex];
    if (!invoice)
      throw new Error(`Seed invoice ${bill.invoiceIndex} is missing`);
    const existed = await Bill.exists({ seedKey: bill.seedKey });
    if (existed) {
      skipped += 1;
      continue;
    }
    await reach(input.env, input.clock, bill, invoice);
    created += 1;
  }
  return { batchId, seed, created, skipped, plan };
}

export async function seedDemo(input: {
  env: Env;
  clock: Clock;
}): Promise<SeedResult> {
  assertSeed(input.env, 'mixed');
  const today = accountDate(input.clock.now(), input.env.AIRWALLEX_ACCOUNT_TZ);
  const bills: Curated[] = [
    {
      seedKey: 'demo:1',
      vendorName: 'Acme GmbH',
      invoiceNumber: 'ACME-1001',
      currency: 'EUR',
      country: 'DE',
      amount: '250000',
      dueIn: 12,
      mode: 'TARGET_RATE',
      distanceBps: 80,
    },
    {
      seedKey: 'demo:2',
      vendorName: 'Northwind Ltd',
      invoiceNumber: 'NW-2044',
      currency: 'GBP',
      country: 'GB',
      amount: '120000',
      dueIn: 20,
      mode: 'MAX_COST',
      distanceBps: 80,
    },
    {
      seedKey: 'demo:3',
      vendorName: 'Bharat Textiles',
      invoiceNumber: 'BT-88',
      currency: 'INR',
      country: 'IN',
      amount: '8500000',
      dueIn: 3,
      mode: 'TARGET_RATE',
      distanceBps: 150,
    },
  ];
  let created = 0;
  let skipped = 0;
  for (const bill of bills) {
    if (await Bill.exists({ seedKey: bill.seedKey })) {
      skipped += 1;
      continue;
    }
    const id = await insertDraft(input.env, {
      seedKey: bill.seedKey,
      generated: false,
      vendorName: bill.vendorName,
      invoiceNumber: bill.invoiceNumber,
      currency: bill.currency,
      amount: bill.amount,
      dueDate: addDays(today, bill.dueIn),
      issueDate: today,
      transferMethod: 'LOCAL',
      transferReason: 'bill_payment',
    });
    await review(input.env, input.clock, id);
    await resolveBeneficiary({
      billId: id,
      env: input.env,
      clock: input.clock,
      body: {
        name: bill.vendorName,
        entityType: 'COMPANY',
        bankCountry: bill.country,
        accountCurrency: bill.currency,
        transferMethod: 'LOCAL',
        accountNumber: '00001234',
      },
    });
    await armWatched(
      input.env,
      input.clock,
      id,
      bill.mode,
      bill.distanceBps,
      bill.amount,
      bill.currency,
    );
    created += 1;
  }
  return {
    batchId: 'demo',
    seed: 0,
    created,
    skipped,
    plan: bills.map((bill) => ({
      seedKey: bill.seedKey,
      state: 'WATCHING',
      currency: bill.currency,
      amount: bill.amount,
    })),
  };
}

const SAMPLE_BILLS = [
  { vendorName: 'Acme GmbH', currency: 'EUR', amount: '2500.00' },
  { vendorName: 'Northwind Ltd', currency: 'GBP', amount: '1800.00' },
  { vendorName: 'Sakura Trading', currency: 'JPY', amount: '320000' },
  { vendorName: 'Harbour Supplies', currency: 'SGD', amount: '9600.00' },
  { vendorName: 'Bharat Textiles', currency: 'INR', amount: '185000.00' },
] as const;

/**
 * DEMO-ONLY: sample invoices are inserted as ready bills, not extracted from a file.
 * PROD: only uploaded documents are extracted and reviewed.
 */
export async function createSampleBills(input: {
  env: Env;
  clock: Clock;
  count: number;
}): Promise<string[]> {
  if (!input.env.DEMO_MODE) throw notFound('Demo mode is off');
  const count = Math.min(SAMPLE_BILLS.length, Math.max(1, input.count));
  const today = accountDate(input.clock.now(), input.env.AIRWALLEX_ACCOUNT_TZ);
  const stamp = input.clock.now().getTime().toString(36);
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const sample = SAMPLE_BILLS[index];
    if (!sample) continue;
    const invoiceNumber = `SAMPLE-${stamp}-${index + 1}`;
    const id = await insertDraft(input.env, {
      seedKey: `sample:${stamp}:${index + 1}`,
      generated: true,
      vendorName: sample.vendorName,
      invoiceNumber,
      currency: sample.currency,
      amount: sample.amount,
      dueDate: addDays(today, 14),
      issueDate: today,
      transferMethod: 'LOCAL',
      transferReason: 'bill_payment',
    });
    await review(input.env, input.clock, id);
    const anchor = DEMO_ANCHORS.find((pair) => pair.base === sample.currency)?.price ?? '1';
    const target = significantPrice(new Decimal(anchor).mul('0.99'));
    await Bill.updateOne(
      { _id: id },
      {
        $set: {
          last: {
            price: toDecimal128(anchor),
            at: input.clock.now(),
            source: 'SIMULATED',
          },
        },
      },
    );
    const beneficiary = await Beneficiary.findOne({ accountCurrency: sample.currency });
    if (beneficiary) {
      await Bill.updateOne({ _id: id }, { $set: { beneficiaryId: beneficiary._id } });
    }
    await putStrategy(
      id,
      { mode: 'TARGET_RATE', targetPrice: target },
      billContext(input.env, input.clock),
    );
    ids.push(id);
  }
  return ids;
}

export async function resetGenerated(): Promise<number> {
  const bills = await Bill.find({ generated: true }).select('_id');
  const ids = bills.map((bill) => bill._id);
  if (ids.length === 0) return 0;
  await BillDocument.deleteMany({ billId: { $in: ids } });
  await BillEvent.deleteMany({ billId: { $in: ids } });
  await Quote.deleteMany({ billId: { $in: ids } });
  await Execution.deleteMany({ billId: { $in: ids } });
  await Bill.deleteMany({ _id: { $in: ids } });
  return ids.length;
}

function assertSeed(env: Env, profile: ProfileName): void {
  if (!env.DEMO_MODE) throw notFound('Demo mode is off');
  if (env.AIRWALLEX_ENV !== 'sandbox' && env.PAYMENTS_GATEWAY !== 'mock') {
    throw invalid('Seeding requires the sandbox or the mock gateway');
  }
  if (
    env.PAYMENTS_GATEWAY !== 'mock' ||
    (profile === 'stress' && env.PAYMENTS_GATEWAY !== 'mock')
  ) {
    throw invalid(
      'This seed path uses the mock gateway. Sandbox lifecycle ids wait for credentials.',
    );
  }
}

async function reach(
  env: Env,
  clock: Clock,
  plan: BillPlan,
  invoice: InvoiceTruth,
): Promise<void> {
  const id = await insertDraft(env, {
    seedKey: plan.seedKey,
    generated: true,
    vendorName: invoice.vendor.name,
    invoiceNumber: invoice.invoiceNumber,
    currency: plan.currency,
    amount: plan.amount,
    dueDate: plan.dueDate,
    issueDate: plan.issueDate,
    transferMethod: plan.transferMethod,
    transferReason: plan.transferReason,
  });
  if (plan.state === 'DRAFT') return;
  await review(env, clock, id);
  if (invoice.bank)
    await attachBank(
      env,
      clock,
      id,
      invoice.vendor.name,
      plan.transferMethod,
      invoice.bank,
    );
  if (plan.state === 'READY') return;
  if (plan.state === 'CANCELLED') {
    await cancelBill(id, billContext(env, clock));
    return;
  }
  await armWatched(
    env,
    clock,
    id,
    plan.strategyMode ?? 'TARGET_RATE',
    plan.targetDistanceBps ?? 80,
    plan.amount,
    plan.currency,
  );
  const armed = await Bill.findById(id);
  if (!armed) return;
  if (armed.state === 'EXECUTING') return;
  if (plan.state === 'WATCHING') return;
  if (plan.state === 'PAUSED') {
    await pauseBill(id, billContext(env, clock));
    return;
  }
  if (plan.state === 'EXECUTING') {
    await pay(env, clock, id);
    return;
  }
  if (
    plan.state === 'IN_FLIGHT' ||
    plan.state === 'PAID' ||
    plan.state === 'FAILED'
  ) {
    await driveSim(env, clock, id, plan.state);
  }
}

async function insertDraft(
  env: Env,
  input: {
    seedKey: string;
    generated: boolean;
    vendorName: string;
    invoiceNumber: string;
    currency: string;
    amount: string;
    dueDate: string;
    issueDate: string;
    transferMethod: 'LOCAL' | 'SWIFT';
    transferReason: TransferReason;
  },
): Promise<string> {
  const created = await Bill.create({
    state: 'DRAFT',
    vendorName: input.vendorName,
    invoiceNumber: input.invoiceNumber,
    billCurrency: input.currency,
    billAmount: toDecimal128(input.amount),
    homeCurrency: env.HOME_CURRENCY,
    issuedDate: utcDateOnly(input.issueDate),
    dueDate: utcDateOnly(input.dueDate),
    executionDeadline: utcDateOnly(input.dueDate),
    transferMethod: input.transferMethod,
    leadDays: input.transferMethod === 'SWIFT' ? 3 : 1,
    transferReason: input.transferReason,
    reference: input.invoiceNumber,
    seedKey: input.seedKey,
    generated: input.generated,
    displayInverted: false,
  });
  return String(created._id);
}

async function review(env: Env, clock: Clock, billId: string): Promise<void> {
  await applyTransition({
    billId,
    event: 'REVIEW',
    clock,
    actor: 'user',
    auditType: 'STRATEGY_UPDATED',
    demoMode: env.DEMO_MODE,
    publisher: eventPublisher(env.REDIS_URL),
  });
}

async function attachBank(
  env: Env,
  clock: Clock,
  billId: string,
  name: string,
  method: 'LOCAL' | 'SWIFT',
  bank: BankDetails,
): Promise<void> {
  const account = bank.iban ?? bank.accountNumber ?? '00001234';
  await resolveBeneficiary({
    billId,
    env,
    clock,
    body: {
      name,
      entityType: 'COMPANY',
      bankCountry: bank.country,
      accountCurrency: bank.currency,
      transferMethod: method,
      ...(bank.iban ? { iban: bank.iban } : { accountNumber: account }),
      ...(bank.bic ? { bic: bank.bic } : {}),
      ...(bank.sortCode || bank.ifsc || bank.bsb || bank.bankCode
        ? {
            localBankCode:
              bank.sortCode ?? bank.ifsc ?? bank.bsb ?? bank.bankCode,
          }
        : {}),
    },
  });
}

async function armWatched(
  env: Env,
  clock: Clock,
  billId: string,
  mode: 'TARGET_RATE' | 'MAX_COST',
  distanceBps: number,
  amount: string,
  currency: string,
): Promise<void> {
  const entry = anchor(currency);
  const target = significantPrice(
    new Decimal(entry).mul(
      new Decimal(1).minus(new Decimal(distanceBps).div(10000)),
    ),
  );
  const current = await Bill.findById(billId);
  if (!current) return;
  await Bill.updateOne(
    { _id: current._id, version: current.version },
    {
      $set: {
        last: {
          price: toDecimal128(entry),
          at: clock.now(),
          source: 'SIMULATED',
        },
      },
      $inc: { version: 1 },
    },
  );
  const ctx = billContext(env, clock);
  if (mode === 'MAX_COST') {
    const maxCost = decimalString(new Decimal(amount).mul(entry).mul('0.99'));
    await putStrategy(billId, { mode: 'MAX_COST', maxCost }, ctx);
  } else {
    await putStrategy(
      billId,
      { mode: 'TARGET_RATE', targetPrice: target },
      ctx,
    );
  }
  await armBill(
    billId,
    {
      standingInstruction: true,
      transferMethod: current.transferMethod,
      transferReason: current.transferReason,
      reference: current.reference || current.invoiceNumber,
    },
    ctx,
  );
}

async function pay(env: Env, clock: Clock, billId: string): Promise<void> {
  await payBillNow({
    billId,
    env,
    clock,
    quotes: quoteLock(env, clock),
    balances: currentBalances(env),
    publisher: eventPublisher(env.REDIS_URL),
    demoMode: env.DEMO_MODE,
  });
}

async function driveSim(
  env: Env,
  clock: Clock,
  billId: string,
  until: 'IN_FLIGHT' | 'PAID' | 'FAILED',
): Promise<void> {
  const origin = 1_700_000_000_000;
  const source = routingRateSource(
    {
      async getIndicative() {
        return { price: '1', source: 'AIRWALLEX' };
      },
    },
    (id) => scriptedPrice(env.REDIS_URL, id),
  );
  const publisher = eventPublisher(env.REDIS_URL);
  await startSimulation({
    env,
    clock,
    billId,
    nowRealMs: origin,
    durationSec: 1,
    advanceEverySec: 1,
    overshootBps: 5,
  });
  for (let second = 0; second < 8; second += 1) {
    const steps = await stepDemoSims({
      env,
      clock,
      nowRealMs: origin + second * 1000,
      source,
      publisher,
    });
    const step = steps.find((item) => item.billId === billId);
    let bill = await Bill.findById(billId);
    if (!bill) return;
    const confirm = bill.strategy?.confirmTicks ?? 2;
    if (
      bill.state === 'WATCHING' &&
      step?.tickId &&
      (bill.trigger?.consecutiveHits ?? 0) >= confirm
    ) {
      await runStrategyJob({
        billId,
        tickId: step.tickId,
        env,
        clock,
        quotes: quoteLock(env, clock),
        balances: currentBalances(env),
        publisher,
        demoMode: env.DEMO_MODE,
      });
      bill = await Bill.findById(billId);
    }
    if (bill?.state === 'EXECUTING') {
      await runExecution({
        env,
        clock,
        balances: currentBalances(env),
        gateway: transferGateway(env, clock),
        publisher,
        demoMode: env.DEMO_MODE,
        billId,
        attempt: await nextTransferAttempt(billId),
        mode: 'TARGET',
      });
      bill = await Bill.findById(billId);
    }
    if (bill?.state === 'IN_FLIGHT' && until === 'IN_FLIGHT') {
      const execution = await Execution.findOne({ billId, active: true });
      if (
        execution?.airwallexTransferId &&
        execution.transferStatus === 'PROCESSING'
      ) {
        await advanceDemoTransfer({
          env,
          clock,
          transferId: execution.airwallexTransferId,
          to: 'SENT',
        });
      }
      await stopSimulation({ env, clock, billId });
      return;
    }
    if (bill?.state === 'IN_FLIGHT' && until === 'FAILED') {
      const execution = await Execution.findOne({ billId, active: true });
      if (execution?.airwallexTransferId) {
        await advanceDemoTransfer({
          env,
          clock,
          transferId: execution.airwallexTransferId,
          to: 'FAILED',
        });
      }
      await stopSimulation({ env, clock, billId });
      return;
    }
    if ((await Bill.findById(billId))?.state === 'PAID') return;
  }
  const finalState = (await Bill.findById(billId))?.state;
  if (until === 'PAID' && finalState === 'PAID') return;
  throw new Error(
    `Seed left ${billId} in ${finalState ?? 'missing'}, wanted ${until}`,
  );
}

function anchor(currency: string): string {
  return (
    DEMO_ANCHORS.find((pair) => pair.base === currency && pair.quote === 'USD')
      ?.price ?? '1'
  );
}

interface Curated {
  seedKey: string;
  vendorName: string;
  invoiceNumber: string;
  currency: string;
  country: string;
  amount: string;
  dueIn: number;
  mode: 'TARGET_RATE' | 'MAX_COST';
  distanceBps: number;
}
