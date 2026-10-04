import { D } from '@/contracts/money';
import Decimal from 'decimal.js';
import mongoose, { type Schema } from 'mongoose';

export function toDecimal128(
  value: Decimal | string,
): mongoose.Types.Decimal128 {
  const decimal = typeof value === 'string' ? D(value) : value;
  if (!decimal.isFinite()) throw new Error('money value must be finite');
  return mongoose.Types.Decimal128.fromString(decimal.toFixed());
}

export function fromDecimal128(value: { toString(): string }): Decimal {
  return D(value.toString());
}

function isDecimal128(value: object): boolean {
  return (
    value instanceof mongoose.Types.Decimal128 ||
    ('_bsontype' in value &&
      (value as { _bsontype?: string })._bsontype === 'Decimal128')
  );
}

function mapDecimal128(value: unknown): unknown {
  if (value instanceof Date || value === null) return value;
  if (typeof value === 'object') {
    if (isDecimal128(value)) return value.toString();
    if (Array.isArray(value)) return value.map(mapDecimal128);
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      record[key] = mapDecimal128(record[key]);
    }
  }
  return value;
}

/** Renders every Decimal128 as a decimal string, matching the contracts. */
export function decimal128JsonPlugin(schema: Schema): void {
  schema.set('toJSON', {
    transform(_doc: unknown, ret: Record<string, unknown>) {
      return mapDecimal128(ret);
    },
  });
}
