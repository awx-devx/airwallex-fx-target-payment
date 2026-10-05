import type {
  ArmBody,
  BeneficiarySchemaBody,
  ChartQuery,
  ListBillsQuery,
  PatchBillBody,
  PutStrategyBody,
} from '@/contracts/api';
import type { BillDetail, StrategyDetail } from '@/contracts/api';
import type {
  ApiErrorCode,
  BalanceSummary,
  ExecutionSummary,
  TransferStatus,
} from '@/contracts/airwallex';
import type { BillAction, BillState, BillSummary } from '@/contracts/bill';
import type {
  ChartMarkerKind,
  ChartRange,
  ChartResponse,
  ChartSeriesPoint,
} from '@/contracts/chart';
import { requireCurrency } from '@/contracts/currencies';
import {
  DataSourceError,
  type DataSource,
  type SimulateOptions,
} from '@/contracts/data-source';
import type { BillEvent, BillEventType } from '@/contracts/events';
import { D, formatDecimal, significantPrice } from '@/contracts/money';
import Decimal from 'decimal.js';
import { allowedActions } from '@/contracts/permissions';
import type { AppEvent, SimPhase } from '@/contracts/sse';
import { createRng } from '@/mocks/generators/rng';
import { balances, bills, events } from '@/mocks/fixtures/catalog';
import { execution, FIXTURE_NOW } from '@/mocks/fixtures/build';
import { formSchemaFor } from '@/mocks/fixtures/forms';
import type { Clock } from '@/mocks/market/clock';
import { ManualClock, WarpClock } from '@/mocks/market/clock';
import type { MarketPair } from '@/mocks/market/gbm';
import { SimulatedMarket } from '@/mocks/market/gbm';

const LIVE_STATES = new Set<BillState>(['DRAFT', 'READY', 'WATCHING', 'PAUSED']);

const MARKERS: Partial<Record<BillEventType, ChartMarkerKind>> = {
  ARMED: 'ARMED',
  NEAR_MISS: 'NEAR_MISS',
  QUOTE_LOCKED: 'TARGET_HIT',
  PAID: 'EXECUTED',
  AUTOSETTLE: 'AUTOSETTLE',
  SIM_STARTED: 'SIM_START',
  SIM_ENDED: 'SIM_END',
};

interface SimRun {
  simId: string;
  billId: string;
  startedRealMs: number;
  durationSec: number;
  from: string;
  to: string;
  phase: SimPhase;
  triggered: boolean;
  executing: boolean;
  processing: boolean;
  sent: boolean;
  paid: boolean;
  done: boolean;
}

function fail(status: number, code: ApiErrorCode, message: string): never {
  throw new DataSourceError(status, { code, message });
}

function pairsFrom(summaries: readonly BillSummary[]): MarketPair[] {
  const seen = new Set<string>();
  const pairs: MarketPair[] = [];
  for (const bill of summaries) {
    const key = `${bill.pair.base}/${bill.pair.quote}`;
    if (seen.has(key) || !bill.lastPrice) continue;
    seen.add(key);
    pairs.push({
      base: bill.pair.base,
      quote: bill.pair.quote,
      price: bill.lastPrice,
    });
  }
  return pairs;
}

function strategyFor(bill: BillSummary): StrategyDetail | undefined {
  if (!bill.strategyMode || !bill.targetPrice) return undefined;
  return {
    mode: bill.strategyMode,
    targetPrice: bill.targetPrice,
    maxCost: bill.maxCost,
    feeEstimate: '0.00',
    bufferBps: 2,
    confirmTicks: 2,
    quoteValidityTarget: 'MIN_1',
    quoteValidityDeadline: 'MIN_1',
    autosettleCutoff: '21:00',
  };
}

/**
 * DEMO-ONLY: in-memory stand-in for the API. A target hit pays immediately.
 * PROD: quotes and transfers come from Airwallex, and transfer status comes
 * from webhooks plus the reconciler.
 */
export class MockDataSource implements DataSource {
  readonly market: SimulatedMarket;
  readonly clock: Clock;
  private readonly readRealMs: () => number;
  private readonly store = new Map<string, BillDetail>();
  private readonly balanceBook: BalanceSummary[];
  private readonly listeners = new Set<(event: AppEvent) => void>();
  private readonly sims = new Map<string, SimRun>();
  private seq = 1;

  constructor(options?: {
    clock?: Clock;
    readRealMs?: () => number;
    marketSeed?: number;
  }) {
    this.clock = options?.clock ?? new ManualClock(Date.parse(FIXTURE_NOW));
    this.readRealMs = options?.readRealMs ?? (() => this.clock.now().getTime());
    const seeded = structuredClone(bills);
    this.market = new SimulatedMarket(
      options?.marketSeed ?? 1,
      pairsFrom(seeded),
    );
    this.balanceBook = structuredClone(balances);
    const history = structuredClone(events);
    for (const bill of seeded) {
      const detail: BillDetail = {
        ...bill,
        documents: [
          {
            id: `doc-${bill.id}`,
            filename: `${bill.invoiceNumber}.pdf`,
            mime: 'application/pdf',
            size: 12000,
            sha256: bill.id.padEnd(64, '0').slice(0, 64),
          },
        ],
        strategy: strategyFor(bill),
        events: history.filter((event) => event.billId === bill.id),
      };
      this.refresh(detail);
      this.store.set(bill.id, detail);
    }
  }

  /** DEMO-ONLY: clones the ready fixture. PROD: sample invoices are not a product path. */
  addSamples(count: number): string[] {
    const template = this.store.get('bill-ready');
    if (!template) fail(404, 'NOT_FOUND', 'Sample bill is not loaded');
    const total = Math.min(5, Math.max(1, count));
    const ids: string[] = [];
    for (let index = 0; index < total; index += 1) {
      const id = `bill-sample-${this.nextId()}`;
      const detail: BillDetail = {
        ...structuredClone(template),
        id,
        invoiceNumber: `SAMPLE-${id.slice(-4)}`,
        events: [],
      };
      this.refresh(detail);
      this.store.set(id, detail);
      ids.push(id);
    }
    return ids;
  }

  async listBills(query?: ListBillsQuery): Promise<BillSummary[]> {
    return [...this.store.values()]
      .map((bill) => this.summary(bill))
      .filter((bill) => {
        if (query?.state && bill.state !== query.state) return false;
        if (query?.base && bill.pair.base !== query.base) return false;
        if (query?.quote && bill.pair.quote !== query.quote) return false;
        return true;
      });
  }

  async getBill(id: string): Promise<BillDetail> {
    return structuredClone(this.requireBill(id));
  }

  async getChart(id: string, query: ChartQuery): Promise<ChartResponse> {
    const bill = this.requireBill(id);
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return {
      series: this.series(bill, now, query.range),
      overlays: {
        ...(bill.entryPrice ? { entry: bill.entryPrice } : {}),
        ...(bill.targetPrice ? { target: bill.targetPrice } : {}),
        executionDeadline: Math.floor(
          Date.parse(`${bill.executionDeadline}T00:00:00.000Z`) / 1000,
        ),
        dueDate: Math.floor(Date.parse(`${bill.dueDate}T00:00:00.000Z`) / 1000),
        now,
        markers: bill.events.flatMap((event) => {
          const kind = MARKERS[event.type];
          if (!kind) return [];
          return [{ time: Math.floor(Date.parse(event.ts) / 1000), kind }];
        }),
      },
    };
  }

  async listEvents(billId: string): Promise<BillEvent[]> {
    return structuredClone(this.requireBill(billId).events);
  }

  async getBalances(): Promise<BalanceSummary[]> {
    return structuredClone(this.balanceBook);
  }

  async getFormSchema(body: BeneficiarySchemaBody) {
    const schema = formSchemaFor(body.bankCountry, body.accountCurrency);
    if (!schema) fail(404, 'NOT_FOUND', 'No form schema for that corridor');
    return structuredClone(schema);
  }

  subscribe(listener: (event: AppEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async patchBill(id: string, body: PatchBillBody): Promise<BillSummary> {
    const bill = this.requireBill(id);
    this.guard(bill, 'EDIT');
    if (body.vendorName) bill.vendorName = body.vendorName;
    if (body.invoiceNumber) bill.invoiceNumber = body.invoiceNumber;
    if (body.amount) bill.amount = body.amount;
    if (body.dueDate) bill.dueDate = body.dueDate;
    if (body.reference) bill.reference = body.reference;
    if (body.transferReason) bill.transferReason = body.transferReason;
    if (body.transferMethod) bill.transferMethod = body.transferMethod;
    return this.publish(bill, undefined, 'user');
  }

  async putStrategy(id: string, body: PutStrategyBody): Promise<BillSummary> {
    const bill = this.requireBill(id);
    this.guard(bill, 'EDIT_STRATEGY');
    bill.strategyMode = body.mode;
    if (body.targetPrice) bill.targetPrice = body.targetPrice;
    if (body.maxCost) bill.maxCost = body.maxCost;
    const strategy = strategyFor(bill);
    if (strategy) {
      bill.strategy = {
        ...strategy,
        bufferBps: body.bufferBps ?? strategy.bufferBps,
        confirmTicks: body.confirmTicks ?? strategy.confirmTicks,
        quoteValidityTarget:
          body.quoteValidityTarget ?? strategy.quoteValidityTarget,
        quoteValidityDeadline:
          body.quoteValidityDeadline ?? strategy.quoteValidityDeadline,
        autosettleCutoff: body.autosettleCutoff ?? strategy.autosettleCutoff,
      };
    }
    return this.publish(bill, 'STRATEGY_UPDATED', 'user');
  }

  async arm(id: string, body: ArmBody): Promise<BillSummary> {
    const bill = this.requireBill(id);
    this.guard(bill, 'ARM');
    if (!bill.lastPrice)
      fail(409, 'INVALID_STATE', 'Bill has no price to arm against');
    bill.state = 'WATCHING';
    bill.entryPrice = bill.lastPrice;
    bill.transferMethod = body.transferMethod;
    bill.transferReason = body.transferReason;
    bill.reference = body.reference;
    return this.publish(bill, 'ARMED', 'user');
  }

  async pause(id: string): Promise<BillSummary> {
    const bill = this.requireBill(id);
    this.guard(bill, 'PAUSE');
    bill.state = 'PAUSED';
    return this.publish(bill, 'PAUSED', 'user');
  }

  async resume(id: string): Promise<BillSummary> {
    const bill = this.requireBill(id);
    this.guard(bill, 'RESUME');
    bill.state = 'WATCHING';
    return this.publish(bill, 'RESUMED', 'user');
  }

  async payNow(id: string): Promise<BillSummary> {
    const bill = this.requireBill(id);
    this.guard(bill, 'PAY_NOW');
    if (!bill.lastPrice) fail(409, 'INVALID_STATE', 'Bill has no price');
    return this.startPayment(bill, 'MANUAL', 'QUOTE_LOCKED', 'user', 'Paying now');
  }

  async cancel(id: string): Promise<BillSummary> {
    const bill = this.requireBill(id);
    this.guard(bill, 'CANCEL');
    return this.cancelBill(bill);
  }

  async rearm(id: string): Promise<BillSummary> {
    const bill = this.requireBill(id);
    this.guard(bill, 'REARM');
    bill.state = 'READY';
    bill.execution = undefined;
    return this.publish(bill, 'STRATEGY_UPDATED', 'user');
  }

  async simulate(billId: string, options?: SimulateOptions): Promise<BillSummary> {
    const bill = this.requireBill(billId);
    this.guard(bill, 'SIMULATE');
    if (!bill.lastPrice || !bill.targetPrice)
      fail(409, 'INVALID_STATE', 'Bill has no target');
    const durationSec = options?.durationSec ?? 12;
    const overshootBps = options?.overshootBps ?? 5;
    const run: SimRun = {
      simId: `sim-${billId}-${this.nextId()}`,
      billId,
      startedRealMs: this.readRealMs(),
      durationSec,
      from: bill.lastPrice,
      to: significantPrice(
        D(bill.targetPrice).mul(
          new Decimal(1).minus(new Decimal(overshootBps).div(10000)),
        ),
      ),
      phase: 'RAMPING',
      triggered: false,
      executing: false,
      processing: false,
      sent: false,
      paid: false,
      done: false,
    };
    this.sims.set(billId, run);
    this.emit({
      type: 'demo.sim',
      billId,
      simId: run.simId,
      phase: 'RAMPING',
      etaSec: durationSec,
    });
    return this.publish(bill, 'SIM_STARTED', 'system:demo-sim', {
      simId: run.simId,
    });
  }

  async stopSimulation(billId: string): Promise<BillSummary> {
    const bill = this.requireBill(billId);
    this.guard(bill, 'STOP_SIMULATION');
    const run = this.sims.get(billId);
    if (!run) fail(409, 'INVALID_STATE', 'No simulation is running');
    run.phase = 'ABORTED';
    this.sims.delete(billId);
    if (bill.state === 'WATCHING') {
      bill.lastPrice = this.market.price(bill.pair.base, bill.pair.quote);
    }
    this.emit({ type: 'demo.sim', billId, simId: run.simId, phase: 'ABORTED' });
    return this.publish(bill, 'SIM_ENDED', 'system:demo-sim', {
      aborted: true,
      simId: run.simId,
    });
  }

  /**
   * DEMO-ONLY: steps a mock transfer PROCESSING → SENT → PAID.
   * PROD: webhooks and the reconciler own transfer status.
   */
  async advanceTransfer(billId: string): Promise<BillSummary> {
    const bill = this.requireBill(billId);
    this.guard(bill, 'ADVANCE_TRANSFER');
    if (!bill.execution) fail(409, 'INVALID_STATE', 'Bill has no transfer');
    const next = nextTransferStatus(bill.execution.status);
    if (!next) fail(409, 'INVALID_STATE', 'Transfer cannot be advanced');
    this.applyTransfer(bill, next, 'user');
    return this.summary(bill);
  }

  /** One seeded market step. Bills on an active Simulate run keep their scripted price. */
  stepMarket(): AppEvent[] {
    const emitted: AppEvent[] = [];
    const now = this.iso();
    for (const tick of this.market.step(this.clock.now().getTime())) {
      const event: AppEvent = {
        type: 'tick',
        pair: { base: tick.base, quote: tick.quote },
        ts: now,
        price: tick.price,
        source: 'SIMULATED',
      };
      emitted.push(event);
      this.emit(event);
      for (const bill of this.store.values()) {
        if (bill.pair.base !== tick.base || bill.pair.quote !== tick.quote)
          continue;
        if (
          this.sims.has(bill.id) ||
          !LIVE_STATES.has(bill.state) ||
          !bill.lastPrice
        )
          continue;
        bill.lastPrice = tick.price;
        const summary = this.publish(bill, undefined, 'system');
        emitted.push({ type: 'bill.updated', bill: summary });
      }
    }
    return emitted;
  }

  /**
   * Drive Simulate timelines from `readRealMs`, including under a warp.
   * The default marks are 12/13/16/19/22/25/26 seconds, scaled when
   * `durationSec` is not 12.
   */
  pump(billId?: string): AppEvent[] {
    const emitted: AppEvent[] = [];
    const runs = [...this.sims.values()].filter(
      (run) => !billId || run.billId === billId,
    );
    for (const run of runs) {
      const bill = this.store.get(run.billId);
      if (!bill) continue;
      const scale = run.durationSec / 12;
      const elapsed = (this.readRealMs() - run.startedRealMs) / 1000;
      const rampEnd = 12 * scale;
      const progress = rampEnd === 0 ? 1 : Math.min(elapsed / rampEnd, 1);
      const price = progress >= 1 ? run.to : eased(run.from, run.to, progress);
      bill.lastPrice = price;
      const tick: AppEvent = {
        type: 'tick',
        pair: bill.pair,
        billId: bill.id,
        ts: this.iso(),
        price,
        source: 'SIMULATED',
      };
      emitted.push(tick);
      this.emit(tick);
      this.at(run, elapsed, 13 * scale, 'triggered', () =>
        this.triggerSim(bill, run),
      );
      this.at(run, elapsed, 16 * scale, 'executing', () =>
        this.executeSim(bill, run, 'SCHEDULED'),
      );
      this.at(run, elapsed, 19 * scale, 'processing', () =>
        this.settleSim(bill, run, 'PROCESSING'),
      );
      this.at(run, elapsed, 22 * scale, 'sent', () =>
        this.settleSim(bill, run, 'SENT'),
      );
      this.at(run, elapsed, 25 * scale, 'paid', () =>
        this.settleSim(bill, run, 'PAID'),
      );
      this.at(run, elapsed, 26 * scale, 'done', () =>
        this.finishSim(bill, run),
      );
      emitted.push({
        type: 'bill.updated',
        bill: this.publish(bill, undefined, 'system'),
      });
    }
    return emitted;
  }

  setWarp(speed: number): void {
    if (!(this.clock instanceof WarpClock))
      throw new Error('setWarp requires a WarpClock');
    this.clock.setSpeed(speed);
    this.emit({ type: 'clock', now: this.iso(), warp: { speed } });
  }

  /** DEMO-ONLY: rehearsal jump onto the bill's deadline. PROD: the sweeper pays from the stored cutoff. */
  jumpToDeadline(billId: string): void {
    const bill = this.requireBill(billId);
    const at = new Date(`${bill.executionDeadline}T16:00:00.000Z`);
    if (this.clock instanceof WarpClock) this.clock.jumpTo(at);
    else if (this.clock instanceof ManualClock) this.clock.set(at.getTime());
    else throw new Error('jumpToDeadline needs a controllable clock');
    this.emit({
      type: 'clock',
      now: this.iso(),
      warp: {
        speed: this.clock instanceof WarpClock ? this.clock.warpSpeed : 1,
      },
    });
    if (
      (bill.state === 'WATCHING' || bill.state === 'PAUSED') &&
      bill.lastPrice
    ) {
      this.startPayment(bill, 'DEADLINE', 'AUTOSETTLE', 'system', 'Paying at the deadline');
    }
  }

  private triggerSim(bill: BillDetail, run: SimRun): void {
    const price = bill.lastPrice ?? run.to;
    run.phase = 'TRIGGERED';
    bill.state = 'EXECUTING';
    this.addEvent(bill, 'QUOTE_LOCKED', 'system:demo-sim', {
      simId: run.simId,
      price,
    });
    this.notify(bill, 'Target hit', 'Paying at the locked quote.', 'success');
    this.emit({
      type: 'demo.sim',
      billId: bill.id,
      simId: run.simId,
      phase: 'TRIGGERED',
    });
  }

  private executeSim(
    bill: BillDetail,
    run: SimRun,
    status: TransferStatus,
  ): void {
    if (bill.state !== 'EXECUTING') return;
    bill.execution = this.transfer(bill, status, 1, 'TARGET');
    run.phase = 'EXECUTING';
    this.addEvent(bill, 'TRANSFER_CREATED', 'system:demo-sim', {
      simId: run.simId,
    });
    this.emit({
      type: 'execution.updated',
      execution: bill.execution,
      billId: bill.id,
    });
    this.emit({
      type: 'demo.sim',
      billId: bill.id,
      simId: run.simId,
      phase: 'EXECUTING',
    });
  }

  private settleSim(
    bill: BillDetail,
    run: SimRun,
    status: TransferStatus,
  ): void {
    if (!bill.execution) return;
    this.applyTransfer(bill, status, 'system:demo-sim');
    run.phase = 'SETTLING';
    this.emit({
      type: 'demo.sim',
      billId: bill.id,
      simId: run.simId,
      phase: 'SETTLING',
    });
  }

  private finishSim(bill: BillDetail, run: SimRun): void {
    run.phase = 'DONE';
    this.sims.delete(bill.id);
    this.addEvent(bill, 'SIM_ENDED', 'system:demo-sim', {
      aborted: false,
      simId: run.simId,
    });
    this.emit({
      type: 'demo.sim',
      billId: bill.id,
      simId: run.simId,
      phase: 'DONE',
    });
  }

  private at(
    run: SimRun,
    elapsed: number,
    mark: number,
    flag: Flag,
    apply: () => void,
  ): void {
    if (run[flag] || elapsed < mark) return;
    run[flag] = true;
    apply();
  }

  private startPayment(
    bill: BillDetail,
    mode: ExecutionSummary['mode'],
    event: BillEventType,
    actor: string,
    title: string,
  ): BillSummary {
    bill.state = 'EXECUTING';
    bill.execution = this.transfer(bill, 'SCHEDULED', 1, mode);
    this.emit({
      type: 'execution.updated',
      execution: bill.execution,
      billId: bill.id,
    });
    this.notify(bill, title, 'The transfer is being created.', 'success');
    return this.publish(bill, event, actor);
  }

  private notify(
    bill: BillDetail,
    title: string,
    body: string,
    level: 'info' | 'success' | 'warn' | 'danger',
  ): void {
    this.emit({
      type: 'notification',
      notification: {
        id: `nt-${this.nextId()}`,
        billId: bill.id,
        title,
        body,
        level,
        createdAt: this.iso(),
        href: `/bills/${bill.id}`,
      },
    });
  }

  private cancelBill(bill: BillDetail): BillSummary {
    bill.state = 'CANCELLED';
    return this.publish(bill, 'CANCELLED', 'user');
  }

  private applyTransfer(
    bill: BillDetail,
    status: TransferStatus,
    actor: string,
  ): void {
    if (!bill.execution) return;
    bill.execution = {
      ...bill.execution,
      status,
      amountsTentative: false,
      updatedAt: this.iso(),
    };
    if (status === 'SENT') bill.state = 'IN_FLIGHT';
    if (status === 'PAID') {
      bill.state = 'PAID';
      bill.execution.dispatchDate = this.iso().slice(0, 10);
    }
    this.addEvent(bill, status === 'PAID' ? 'PAID' : 'TRANSFER_STATUS', actor, {
      status,
    });
    this.emit({
      type: 'execution.updated',
      execution: bill.execution,
      billId: bill.id,
    });
    this.refresh(bill);
  }

  private transfer(
    bill: BillDetail,
    status: TransferStatus,
    attempt: number,
    mode: ExecutionSummary['mode'],
  ): ExecutionSummary {
    const id = this.nextId();
    return {
      ...execution({
        id,
        billId: bill.id,
        status,
        currency: bill.pair.base,
        amount: bill.amount,
        rate: bill.lastPrice ?? '1',
        method: bill.transferMethod,
        attempt,
        mode,
      }),
      updatedAt: this.iso(),
    };
  }

  private guard(bill: BillDetail, action: BillAction): void {
    const options = {
      demoMode: true,
      simulationRunning: this.sims.has(bill.id),
    };
    if (!allowedActions(bill, options).includes(action)) {
      fail(409, 'INVALID_STATE', `${action} is not available in ${bill.state}`);
    }
  }

  private publish(
    bill: BillDetail,
    type: BillEventType | undefined,
    actor: string,
    payload?: Record<string, unknown>,
  ): BillSummary {
    if (type) this.addEvent(bill, type, actor, payload);
    this.refresh(bill);
    const summary = this.summary(bill);
    this.emit({ type: 'bill.updated', bill: summary });
    return summary;
  }

  private addEvent(
    bill: BillDetail,
    type: BillEventType,
    actor: string,
    payload?: Record<string, unknown>,
  ): void {
    bill.events.push({
      id: `ev-${this.nextId()}`,
      billId: bill.id,
      ts: this.iso(),
      type,
      actor,
      payload,
    });
  }

  private refresh(bill: BillDetail): void {
    const precision = requireCurrency(bill.pair.quote).payoutPrecision;
    if (bill.entryPrice && bill.lastPrice) {
      const delta = D(bill.entryPrice).minus(bill.lastPrice);
      bill.savings = formatDecimal(D(bill.amount).mul(delta), precision);
      bill.savingsPct = formatDecimal(delta.div(bill.entryPrice), 2);
    }
    if (bill.lastPrice) {
      bill.estCost = formatDecimal(
        D(bill.amount).mul(bill.lastPrice),
        precision,
      );
      bill.lastTickAt = this.iso();
    }
    if (bill.lastPrice && bill.targetPrice && !D(bill.lastPrice).isZero()) {
      bill.distanceToTargetBps = D(bill.lastPrice)
        .minus(bill.targetPrice)
        .div(bill.lastPrice)
        .mul(10000)
        .toDecimalPlaces(0)
        .toNumber();
    }
    bill.allowedActions = allowedActions(bill, {
      demoMode: true,
      simulationRunning: this.sims.has(bill.id),
    });
  }

  private series(
    bill: BillDetail,
    nowSec: number,
    range: ChartRange,
  ): ChartSeriesPoint[] {
    const dueSec = Math.floor(
      Date.parse(`${bill.dueDate}T00:00:00.000Z`) / 1000,
    );
    const span =
      range === '1D'
        ? 86_400
        : range === '5D'
          ? 5 * 86_400
          : range === '1M'
            ? 30 * 86_400
            : range === '3M'
              ? 90 * 86_400
              : Math.max(dueSec - nowSec + 86_400, 86_400);
    const history = this.market.history(bill.pair.base, bill.pair.quote);
    const byTime = new Map<number, string>();
    for (const point of seededSeries(bill, nowSec, span)) {
      byTime.set(point.time, point.value);
    }
    for (const tick of history) {
      const time = Math.floor(tick.time / 1000);
      if (time < nowSec - span) continue;
      byTime.set(time, tick.price);
    }
    return [...byTime.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([time, value]) => ({ time, value }));
  }

  private summary(bill: BillDetail): BillSummary {
    this.refresh(bill);
    return {
      id: bill.id,
      state: bill.state,
      vendorName: bill.vendorName,
      invoiceNumber: bill.invoiceNumber,
      pair: bill.pair,
      amount: bill.amount,
      dueDate: bill.dueDate,
      executionDeadline: bill.executionDeadline,
      entryPrice: bill.entryPrice,
      targetPrice: bill.targetPrice,
      maxCost: bill.maxCost,
      strategyMode: bill.strategyMode,
      lastPrice: bill.lastPrice,
      lastTickAt: bill.lastTickAt,
      savings: bill.savings,
      savingsPct: bill.savingsPct,
      distanceToTargetBps: bill.distanceToTargetBps,
      estCost: bill.estCost,
      transferMethod: bill.transferMethod,
      transferReason: bill.transferReason,
      reference: bill.reference,
      beneficiary: bill.beneficiary,
      execution: bill.execution,
      flags: bill.flags,
      allowedActions: bill.allowedActions,
    };
  }

  private requireBill(id: string): BillDetail {
    const bill = this.store.get(id);
    if (!bill) fail(404, 'NOT_FOUND', `Bill ${id} not found`);
    return bill;
  }

  private emit(event: AppEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private iso(): string {
    return this.clock.now().toISOString();
  }

  private nextId(): string {
    this.seq += 1;
    return String(this.seq).padStart(12, '0');
  }
}

type Flag = 'triggered' | 'executing'
  | 'processing'
  | 'sent'
  | 'paid'
  | 'done';

function eased(from: string, to: string, t: number): string {
  const progress = new Decimal(t);
  const curve = progress.lte('0.5')
    ? progress.pow(3).mul(4)
    : D('1').minus(progress.mul(-2).plus(2).pow(3).div(2));
  return significantPrice(D(from).plus(D(to).minus(from).mul(curve)));
}

function nextTransferStatus(
  status: TransferStatus,
): TransferStatus | undefined {
  if (status === 'SCHEDULED' || status === 'PROCESSING') return 'SENT';
  if (status === 'SENT') return 'PAID';
  return undefined;
}

function seededSeries(
  bill: BillDetail,
  nowSec: number,
  spanSec: number,
): ChartSeriesPoint[] {
  const span = Math.min(Math.max(spanSec, 3_600), 90 * 86_400);
  const count = 96;
  const step = Math.max(60, Math.floor(span / count));
  const rng = createRng(hash(bill.id));
  const last = D(bill.lastPrice ?? '1');
  const walked = [last];
  let cursor = last;
  for (let i = 0; i < count; i += 1) {
    const wobble = new Decimal(rng.int(-8, 8)).div(10000);
    cursor = cursor.mul(D('1').plus(wobble));
    if (cursor.lessThanOrEqualTo(0)) cursor = last;
    walked.push(cursor);
  }
  walked.reverse();
  const start = nowSec - count * step;
  return walked.map((value, index) => ({
    time: start + index * step,
    value: significantPrice(index === count ? last : value),
  }));
}

function hash(value: string): number {
  let acc = 2166136261;
  for (const char of value) acc = Math.imul(acc ^ char.charCodeAt(0), 16777619);
  return acc >>> 0;
}
