import {
  isLosslessNumber,
  LosslessNumber,
  parse,
  stringify,
} from 'lossless-json';
import { isDecimalString } from '@/contracts/money';

/**
 * AIRWALLEX: response amounts are JSON numbers. `JSON.parse` rounds past
 * ~15 significant digits, so bodies are parsed with lossless-json and every
 * number is kept as its original decimal string.
 * https://www.airwallex.com/docs/api
 */

export function parseAirwallexJson(text: string): unknown {
  return revive(parse(text));
}

export function jsonNumber(literal: string): LosslessNumber {
  if (!isDecimalString(literal)) {
    throw new Error(`Not a decimal string: ${literal}`);
  }
  return new LosslessNumber(literal);
}

/** Serialises `LosslessNumber` as a raw JSON numeric literal, never via `Number()`. */
export function stringifyAirwallexJson(value: unknown): string {
  const text = stringify(value);
  if (text === undefined) {
    throw new Error('Cannot serialise Airwallex body');
  }
  return text;
}

function revive(value: unknown): unknown {
  if (isLosslessNumber(value)) return value.toString();
  if (Array.isArray(value)) return value.map(revive);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = revive(child);
    }
    return out;
  }
  return value;
}
