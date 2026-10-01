import { cx } from '@/ui/primitives/cx';
import { formatUtcDate } from '@/ui/trading/time-label';

export function DeadlineMeter({
  armedAt,
  now,
  executeBy,
  due,
  variant = 'full',
  finalDay = false,
  overdue = false,
  skipped = [],
}: {
  armedAt: string;
  now: string;
  executeBy: string;
  due: string;
  variant?: 'compact' | 'full';
  finalDay?: boolean;
  overdue?: boolean;
  skipped?: ReadonlyArray<{ date: string; reason: string }>;
}) {
  const nowAt = clamp(place(armedAt, due, now));
  const executeAt = clamp(place(armedAt, due, executeBy));
  return (
    <div className={variant === 'compact' ? 'w-36' : 'w-full max-w-md'}>
      <div className="relative h-1.5 rounded-full bg-bg-3">
        <span
          className={cx(
            'absolute top-1/2 size-2 -translate-y-1/2 rounded-full',
            overdue ? 'bg-down' : finalDay ? 'bg-warn' : 'bg-orange-500',
          )}
          style={{ left: `${nowAt * 100}%` }}
        />
        <span
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-warn"
          style={{ left: `${executeAt * 100}%` }}
        />
      </div>
      {variant === 'full' ? (
        <div className="mt-1 flex justify-between text-[11px] text-fg-3">
          <span>Armed {formatUtcDate(armedAt)}</span>
          <span className={finalDay || overdue ? 'text-warn' : undefined}>
            Execute {formatUtcDate(executeBy)}
          </span>
          <span>Due {formatUtcDate(due)}</span>
        </div>
      ) : null}
      {variant === 'full'
        ? skipped.map((day) => (
            <p key={day.date} className="mt-1 text-[11px] text-fg-3">
              Skipped {formatUtcDate(day.date)}: {day.reason}
            </p>
          ))
        : null}
    </div>
  );
}

function place(start: string, end: string, point: string): number {
  const from = Date.parse(start);
  const to = Date.parse(end);
  const at = Date.parse(point);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return (at - from) / (to - from);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
