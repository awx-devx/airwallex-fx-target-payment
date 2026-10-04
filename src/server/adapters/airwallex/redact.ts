import { isRecord } from '@/server/adapters/airwallex/values';

const MASK_KEYS = new Set([
  'iban',
  'account_number',
  'account_name',
  'account_routing_value1',
  'account_routing_value2',
  'swift_code',
  'bic',
  'bic_swift',
  'sort_code',
  'bank_account_number',
  'street_address',
  'address_line1',
  'address_line2',
  'email',
  'mobile',
  'phone_number',
  'contact_number',
  'fax_number',
  'url',
]);

/** Last four characters only. Amounts and ids are left intact. */
export function redactAirwallex(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAirwallex);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'urls' && Array.isArray(child)) {
      out[key] = child.map((item) => (typeof item === 'string' ? mask(item) : redactAirwallex(item)));
    } else if ((MASK_KEYS.has(key) || key === 'number') && typeof child === 'string') {
      out[key] = mask(child);
    } else {
      out[key] = redactAirwallex(child);
    }
  }
  return out;
}

function mask(value: string): string {
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}
