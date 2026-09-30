function utc(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

export function addDays(iso: string, days: number): string {
  const date = utc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addBusinessDays(iso: string, days: number): string {
  let current = iso;
  let left = days;
  while (left > 0) {
    current = addDays(current, 1);
    const day = utc(current).getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return current;
}

export function spansWeekend(from: string, to: string): boolean {
  let current = from;
  while (current < to) {
    current = addDays(current, 1);
    const day = utc(current).getUTCDay();
    if (day === 0 || day === 6) return true;
  }
  return false;
}
