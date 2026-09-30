import Decimal from 'decimal.js';
import { pipSize } from '@/contracts/currencies';
import { D, significantPrice } from '@/contracts/money';
import { createRng, type Rng } from '@/mocks/generators/rng';

/**
 * DEMO-ONLY: seeded geometric Brownian motion stands in for the live rate feed.
 * PROD: poll bill-sized rates/current; triggers only from real ticks.
 */

export interface MarketPair {
  base: string;
  quote: string;
  price: string;
  drift?: string;
  vol?: string;
}

export interface MarketTick {
  base: string;
  quote: string;
  price: string;
  time: number;
}

interface Script {
  kind: 'ramp' | 'spike';
  from: Decimal;
  to: Decimal;
  startStep: number;
  durationSteps: number;
}

interface PairState {
  base: string;
  quote: string;
  price: Decimal;
  drift: Decimal;
  vol: Decimal;
  pip: Decimal;
  script?: Script;
  history: MarketTick[];
}

function pairKey(base: string, quote: string): string {
  return `${base}/${quote}`;
}

function easeInOutCubic(t: Decimal): Decimal {
  if (t.lte('0.5')) return t.pow(3).mul(4);
  const u = t.mul(-2).plus(2);
  return new Decimal(1).minus(u.pow(3).div(2));
}

function unitNormal(rng: Rng): Decimal {
  const u1 = Math.max(rng.next(), 1e-12);
  const u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return new Decimal(z.toFixed(12));
}

export class SimulatedMarket {
  private readonly rng: Rng;
  private readonly pairs = new Map<string, PairState>();
  private stepIndex = 0;

  constructor(
    seed: number,
    pairs: readonly MarketPair[],
    private readonly tickMs = 500,
  ) {
    this.rng = createRng(seed >>> 0);
    for (const pair of pairs) {
      this.pairs.set(pairKey(pair.base, pair.quote), {
        base: pair.base,
        quote: pair.quote,
        price: D(pair.price),
        drift: D(pair.drift ?? '0'),
        vol: D(pair.vol ?? '0.0004'),
        pip: D(pipSize(pair.quote)),
        history: [],
      });
    }
  }

  price(base: string, quote: string): string {
    return significantPrice(this.require(base, quote).price);
  }

  history(base: string, quote: string): MarketTick[] {
    return this.require(base, quote).history;
  }

  /** One GBM step, or the next point of an active ramp or spike. */
  step(time: number): MarketTick[] {
    this.stepIndex += 1;
    const ticks: MarketTick[] = [];
    for (const state of this.pairs.values()) {
      state.price = this.nextPrice(state);
      const tick = {
        base: state.base,
        quote: state.quote,
        price: significantPrice(state.price),
        time,
      };
      state.history.push(tick);
      if (state.history.length > 5000) state.history.shift();
      ticks.push(tick);
    }
    return ticks;
  }

  nudge(base: string, quote: string, pips: number): string {
    const state = this.require(base, quote);
    const delta = state.pip.mul(pips);
    state.price = this.positive(state.price.plus(delta));
    if (state.script) {
      state.script.from = this.positive(state.script.from.plus(delta));
      state.script.to = this.positive(state.script.to.plus(delta));
    }
    return significantPrice(state.price);
  }

  rampTo(base: string, quote: string, price: string, seconds: number): void {
    const state = this.require(base, quote);
    state.script = {
      kind: 'ramp',
      from: state.price,
      to: D(price),
      startStep: this.stepIndex,
      durationSteps: Math.max(1, Math.round((seconds * 1000) / this.tickMs)),
    };
  }

  spike(base: string, quote: string, pips: number, seconds: number): void {
    const state = this.require(base, quote);
    state.script = {
      kind: 'spike',
      from: state.price,
      to: state.price.plus(state.pip.mul(pips)),
      startStep: this.stepIndex,
      durationSteps: Math.max(1, Math.round((seconds * 1000) / this.tickMs)),
    };
  }

  private nextPrice(state: PairState): Decimal {
    const script = state.script;
    if (!script) return this.gbm(state);
    const elapsed = this.stepIndex - script.startStep;
    const t = Decimal.min(new Decimal(elapsed).div(script.durationSteps), 1);
    if (t.gte(1)) {
      state.script = undefined;
      return script.kind === 'ramp'
        ? this.positive(script.to)
        : this.positive(script.from);
    }
    if (script.kind === 'spike') {
      const offset = script.to
        .minus(script.from)
        .mul(Decimal.sin(t.mul(Decimal.acos(-1))));
      return this.positive(script.from.plus(offset));
    }
    const eased = easeInOutCubic(t);
    const noise = unitNormal(this.rng)
      .mul(state.pip)
      .mul(new Decimal(1).minus(t))
      .mul('0.25');
    return this.positive(
      script.from.plus(script.to.minus(script.from).mul(eased)).plus(noise),
    );
  }

  private gbm(state: PairState): Decimal {
    const z = unitNormal(this.rng);
    const exponent = state.drift
      .minus(state.vol.pow(2).div(2))
      .plus(state.vol.mul(z));
    return this.positive(state.price.mul(exponent.exp()));
  }

  private positive(value: Decimal): Decimal {
    return value.lte('0.00000001') ? new Decimal('0.00000001') : value;
  }

  private require(base: string, quote: string): PairState {
    const state = this.pairs.get(pairKey(base, quote));
    if (!state) throw new Error(`No simulated market for ${base}/${quote}`);
    return state;
  }
}

export const DEMO_ANCHORS: readonly MarketPair[] = [
  { base: 'EUR', quote: 'USD', price: '1.085' },
  { base: 'GBP', quote: 'USD', price: '1.27' },
  { base: 'JPY', quote: 'USD', price: '0.0067' },
  { base: 'INR', quote: 'USD', price: '0.012' },
  { base: 'AUD', quote: 'USD', price: '0.66' },
  { base: 'SGD', quote: 'USD', price: '0.76' },
];
