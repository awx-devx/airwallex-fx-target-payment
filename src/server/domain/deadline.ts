import type { TransferMethod } from '@/contracts/airwallex';
import { fromZonedTime } from 'date-fns-tz';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CUTOFF = /^([01]\d|2[0-3]):[0-5]\d$/;

/** LOCAL 1, SWIFT 3. The form schema's flight time replaces this when it is known. */
export function defaultLeadDays(method: TransferMethod): number {
  return method === 'SWIFT' ? 3 : 1;
}

/**
 * Calendar date `leadDays` business days before `dueDate`.
 * Weekends and `skip` (YYYY-MM-DD, the pair's non-conversion days) are not counted.
 * A lead of 0 keeps the due date.
 */
export function subtractBusinessDays(
  dueDate: string,
  leadDays: number,
  skip: readonly string[] = [],
): string {
  const due = civilDate(dueDate);
  if (!Number.isInteger(leadDays) || leadDays < 0) {
    throw new Error('lead days must be a non-negative integer');
  }
  if (leadDays === 0) return formatCivil(due);
  const holidays = new Set(skip);
  let cursor = due;
  let remaining = leadDays;
  while (remaining > 0) {
    cursor = addDays(cursor, -1);
    if (isBusinessDay(cursor, holidays)) remaining -= 1;
  }
  return formatCivil(cursor);
}

/** `executionDeadline` at `cutoff` (`HH:mm`) in `timeZone`, as a UTC instant. */
export function cutoffInstant(executionDeadline: string, cutoff: string, timeZone: string): Date {
  civilDate(executionDeadline);
  if (!CUTOFF.test(cutoff)) throw new Error('cutoff must be HH:mm');
  return fromZonedTime(`${executionDeadline}T${cutoff}:00`, timeZone);
}

export function executionSchedule(input: {
  dueDate: string;
  leadDays: number;
  skip?: readonly string[];
  cutoff: string;
  timeZone: string;
}): { executionDeadline: string; autosettleAt: Date } {
  const executionDeadline = subtractBusinessDays(input.dueDate, input.leadDays, input.skip);
  return {
    executionDeadline,
    autosettleAt: cutoffInstant(executionDeadline, input.cutoff, input.timeZone),
  };
}

/** A date-only value stored at 00:00 UTC. */
export function utcDateOnly(isoDate: string): Date {
  civilDate(isoDate);
  return fromZonedTime(`${isoDate}T00:00:00`, 'UTC');
}

export function formatUtcDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

interface Civil {
  year: number;
  month: number;
  day: number;
}

function civilDate(isoDate: string): Civil {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new Error('due date must be YYYY-MM-DD');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = fromEpochDay(toEpochDay({ year, month, day }));
  if (check.year !== year || check.month !== month || check.day !== day) {
    throw new Error('due date must be YYYY-MM-DD');
  }
  return { year, month, day };
}

function formatCivil(date: Civil): string {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${date.year}-${month}-${day}`;
}

function addDays(date: Civil, days: number): Civil {
  return fromEpochDay(toEpochDay(date) + days);
}

function isBusinessDay(date: Civil, holidays: ReadonlySet<string>): boolean {
  const weekday = weekdayIndex(date);
  if (weekday === 0 || weekday === 6) return false;
  return !holidays.has(formatCivil(date));
}

/** Sakamoto. 0 is Sunday. */
function weekdayIndex(date: Civil): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let year = date.year;
  if (date.month < 3) year -= 1;
  const index =
    (year +
      Math.floor(year / 4) -
      Math.floor(year / 100) +
      Math.floor(year / 400) +
      (offsets[date.month - 1] ?? 0) +
      date.day) %
    7;
  return index;
}

function toEpochDay(date: Civil): number {
  let year = date.year;
  if (date.month <= 2) year -= 1;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear =
    Math.floor((153 * (date.month + (date.month > 2 ? -3 : 9)) + 2) / 5) + date.day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function fromEpochDay(epochDay: number): Civil {
  const shifted = epochDay + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) /
      365,
  );
  const year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPart = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPart + 2) / 5) + 1;
  const month = monthPart + (monthPart < 10 ? 3 : -9);
  return { year: year + (month <= 2 ? 1 : 0), month, day };
}
