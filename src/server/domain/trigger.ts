import type { RateSourceKind } from '@/contracts/sse';
import { D } from '@/contracts/money';

export const REARM_IMPROVE_BPS = 10;

export interface PriceTick {
  price: string;
  at: Date;
  source: RateSourceKind;
}

export type TriggerOutcome =
  | { kind: 'ignored'; consecutiveHits: number }
  | { kind: 'stale'; consecutiveHits: 0 }
  | { kind: 'cooldown'; consecutiveHits: number }
  | { kind: 'miss'; consecutiveHits: 0 }
  | { kind: 'counting'; consecutiveHits: number }
  | { kind: 'ready'; consecutiveHits: number };

/**
 * Threshold, confirmation, freshness, and the post-near-miss cooldown.
 * A `ready` result still needs the quote check before the bill can execute.
 */
export function evaluateTrigger(input: {
  now: Date;
  tick: PriceTick;
  targetPrice: string;
  bufferBps: number;
  confirmTicks: number;
  pollIntervalMs: number;
  consecutiveHits: number;
  cooldownUntil?: Date;
  lastNearMissPrice?: string;
  rearmImproveBps: number;
}): TriggerOutcome {
  if (!Number.isInteger(input.confirmTicks) || input.confirmTicks < 1) {
    throw new Error('confirm ticks start at 1');
  }
  if (input.tick.source === 'REFERENCE') {
    return { kind: 'ignored', consecutiveHits: input.consecutiveHits };
  }
  const age = input.now.getTime() - input.tick.at.getTime();
  if (age >= 2 * input.pollIntervalMs) return { kind: 'stale', consecutiveHits: 0 };
  if (inCooldown(input) && !improvedEnough(input.tick.price, input.lastNearMissPrice, input.rearmImproveBps)) {
    return { kind: 'cooldown', consecutiveHits: input.consecutiveHits };
  }
  if (!meetsThreshold(input.tick.price, input.targetPrice, input.bufferBps)) {
    return { kind: 'miss', consecutiveHits: 0 };
  }
  const consecutiveHits = input.consecutiveHits + 1;
  if (consecutiveHits >= input.confirmTicks) return { kind: 'ready', consecutiveHits };
  return { kind: 'counting', consecutiveHits };
}

/** `p_quote <= p_target`. A simulated tick is compared instead of the sandbox quote. */
export function acceptLockedPrice(input: {
  targetPrice: string;
  quotePrice: string;
  simulated: boolean;
  simulatedPrice?: string;
}): boolean {
  const compared = input.simulated ? input.simulatedPrice : input.quotePrice;
  if (!compared) throw new Error('simulated tick has no price');
  return D(compared).lte(input.targetPrice);
}

function meetsThreshold(price: string, targetPrice: string, bufferBps: number): boolean {
  const limit = D(targetPrice).mul(D('1').minus(D(String(bufferBps)).div('10000')));
  return D(price).lte(limit);
}

function inCooldown(input: { now: Date; cooldownUntil?: Date }): boolean {
  if (!input.cooldownUntil) return false;
  return input.now.getTime() < input.cooldownUntil.getTime();
}

function improvedEnough(price: string, reference: string | undefined, rearmImproveBps: number): boolean {
  if (!reference || D(reference).isZero()) return false;
  const bps = D(reference).minus(price).div(reference).mul(10000);
  return bps.gte(String(rearmImproveBps));
}
