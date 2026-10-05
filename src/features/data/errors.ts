import type { ApiError, FieldError } from '@/contracts/airwallex';

export type PresentedError = {
  /** Toast, a ticket banner, or a degraded price feed. */
  surface: 'toast' | 'banner' | 'stale';
  tone: 'error' | 'warning' | 'info';
  title: string;
  body?: string;
  fieldErrors?: FieldError[];
};

/**
 * One place for `{ error: ApiError }` → what the terminal shows.
 * Copy follows docs/13 §2.1.
 */
export function presentApiError(error: ApiError): PresentedError {
  const fields = error.fieldErrors;
  switch (error.code) {
    case 'VALIDATION_FAILED':
      return {
        surface: 'banner',
        tone: 'error',
        title: 'Check the form',
        body: fieldSummary(fields) ?? error.message,
        fieldErrors: fields,
      };
    case 'QUOTE_EXPIRED':
      return { surface: 'toast', tone: 'warning', title: 'Quote expired · still watching' };
    case 'QUOTE_INVALID':
      return {
        surface: 'toast',
        tone: 'warning',
        title: 'Quote expired · still watching',
        body: 'Re-quoted',
      };
    case 'AIRWALLEX_CONFIG':
      return {
        surface: 'banner',
        tone: 'error',
        title: 'Airwallex account configuration',
        body: error.message,
      };
    case 'INSUFFICIENT_BALANCE':
      return {
        surface: 'banner',
        tone: 'warning',
        title: 'Not enough balance',
        body: 'Top up the wallet to keep this bill armed.',
      };
    case 'AMOUNT_LIMIT':
      return {
        surface: 'banner',
        tone: 'warning',
        title: 'Outside Airwallex FX limits ($1–$5M)',
        body: error.message,
      };
    case 'ROUTE_UNSUPPORTED':
      return { surface: 'banner', tone: 'error', title: "This corridor isn't supported", body: error.message };
    case 'DATE_INVALID':
      return { surface: 'banner', tone: 'error', title: "That date isn't a valid settlement date", body: error.message };
    case 'CORRIDOR_REQUIREMENT':
      return {
        surface: 'banner',
        tone: 'error',
        title: 'Corridor needs extra compliance steps',
        body: error.message,
      };
    case 'TRANSFER_NOT_CANCELLABLE':
      return { surface: 'toast', tone: 'error', title: "Already sent, can't be cancelled" };
    case 'NOT_FOUND':
      return { surface: 'toast', tone: 'error', title: 'Not found', body: error.message };
    case 'RATE_LIMITED':
      return { surface: 'stale', tone: 'warning', title: 'Price feed is limited' };
    case 'AIRWALLEX_UNAVAILABLE':
      if (!error.airwallex) {
        return {
          surface: 'toast',
          tone: 'error',
          title: "The server didn't respond",
          body: error.message === "The server didn't respond" ? undefined : error.message,
        };
      }
      return { surface: 'stale', tone: 'warning', title: 'Airwallex is unavailable', body: error.message };
    case 'INVALID_STATE':
      return { surface: 'toast', tone: 'warning', title: 'That bill changed', body: error.message };
    case 'FORBIDDEN':
      return { surface: 'toast', tone: 'error', title: "You can't do that", body: error.message };
    case 'AIRWALLEX_ERROR':
      return { surface: 'toast', tone: 'error', title: 'Airwallex rejected that', body: error.message };
    default: {
      const never: never = error.code;
      return never;
    }
  }
}

function fieldSummary(fields: FieldError[] | undefined): string | undefined {
  if (!fields || fields.length === 0) return undefined;
  return fields.map((field) => `${field.path}: ${field.message}`).join(' · ');
}
