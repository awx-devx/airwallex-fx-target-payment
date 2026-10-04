import { isDecimalString } from '@/contracts/money';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requiredString(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Airwallex response is missing ${key}`);
  }
  return value;
}

export function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Airwallex ${key} is not a string`);
  }
  return value;
}

export function decimalField(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = requiredString(record, key);
  if (!isDecimalString(value)) {
    throw new Error(`Airwallex ${key} is not a decimal string`);
  }
  return value;
}

export function optionalDecimal(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = optionalString(record, key);
  if (value === undefined) return undefined;
  if (!isDecimalString(value)) {
    throw new Error(`Airwallex ${key} is not a decimal string`);
  }
  return value;
}
