const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Calendar label in UTC, so a date-only string stays on that day in every timezone. */
export function formatUtcDate(
  value: string,
  pattern: 'day' | 'day-time' | 'day-year' = 'day',
): string {
  const iso = value.includes('T') ? value : `${value}T00:00:00.000Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.getUTCDate();
  const month = MONTHS[date.getUTCMonth()] ?? '';
  if (pattern === 'day-time') {
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${day} ${month} ${hours}:${minutes}`;
  }
  if (pattern === 'day-year') return `${day} ${month} ${date.getUTCFullYear()}`;
  return `${day} ${month}`;
}
