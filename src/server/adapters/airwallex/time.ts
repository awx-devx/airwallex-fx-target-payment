/**
 * AIRWALLEX: timestamps use a numeric offset without a colon
 * (`2017-03-22T16:08:02+1100`, `+0000`). Contracts store UTC `Z`.
 * https://www.airwallex.com/docs/api
 */
const OFFSET_WITHOUT_COLON = /([+-])(\d{2})(\d{2})$/;

export function parseAwxTimestamp(value: string): Date {
  const trimmed = value.trim();
  const normalized = OFFSET_WITHOUT_COLON.test(trimmed)
    ? trimmed.replace(OFFSET_WITHOUT_COLON, '$1$2:$3')
    : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unparseable Airwallex timestamp: ${value}`);
  }
  return parsed;
}

export function toIsoUtc(value: string): string {
  return parseAwxTimestamp(value).toISOString();
}
