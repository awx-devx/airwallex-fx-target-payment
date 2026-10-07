import type { FieldError, TransferMethod } from '@/contracts/airwallex';
import type { TransferMethodOption } from '@/ui/primitives/transfer-method';

const METHODS: readonly TransferMethodOption[] = [
  { method: 'LOCAL', flightTime: { min: 'P0D', max: 'P1D' } },
  { method: 'SWIFT', flightTime: { min: 'P1D', max: 'P3D' } },
];

/** Both methods stay visible. One the bank cannot take is marked unavailable. */
export function armMethodOptions(
  currency: string,
  supported: readonly TransferMethod[] | undefined,
  rejected?: { method: TransferMethod; message: string } | null,
): TransferMethodOption[] {
  return METHODS.map((option) => ({
    ...option,
    unavailable: methodUnavailable(option.method, currency, supported, rejected),
  }));
}

const METHOD_CODES = new Set(['024', '031', '040', '043']);

/** A validate failure that means this transfer method cannot be used. */
export function isMethodFailure(error: FieldError): boolean {
  return error.path === 'create_transfer_request' || METHOD_CODES.has(error.code);
}

/**
 * Method failures stay on the picker. Other field errors are their messages
 * only. Routing "Required" lines that arrive with a method failure are dropped.
 */
export function splitArmErrors(errors: readonly FieldError[]): {
  method?: string;
  fields: string[];
} {
  const method = errors.find(isMethodFailure);
  if (method) return { method: method.message, fields: [] };
  return { fields: [...new Set(errors.map((error) => error.message).filter((message) => message.length > 0))] };
}

/** Why a method cannot be selected. A validate rejection wins over the stored list. */
export function methodUnavailable(
  method: TransferMethod,
  currency: string,
  supported: readonly TransferMethod[] | undefined,
  rejected?: { method: TransferMethod; message: string } | null,
): string | undefined {
  if (rejected?.method === method) return rejected.message;
  if (supported && !supported.includes(method)) {
    return `This bank can't receive ${currency} via ${method}.`;
  }
  return undefined;
}
