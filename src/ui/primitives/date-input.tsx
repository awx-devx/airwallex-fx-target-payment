'use client';

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  differenceInBusinessDays,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useState } from 'react';
import { cx } from '@/ui/primitives/cx';
import { IconButton } from '@/ui/primitives/icon-button';
import { Tooltip } from '@/ui/primitives/tooltip';

export interface ClosedDay {
  date: string;
  reason: string;
}

export function DateInput({
  value,
  onValueChange,
  today,
  disableWeekends = false,
  closedDays = [],
  label = 'Date',
}: {
  value?: string;
  onValueChange: (date: string) => void;
  today: string;
  disableWeekends?: boolean;
  closedDays?: readonly ClosedDay[];
  label?: string;
}) {
  const fieldId = useId();
  const todayDate = parseISO(today);
  const selected = value ? parseISO(value) : undefined;
  const past = selected ? isBefore(selected, todayDate) && !isSameDay(selected, todayDate) : false;
  const [open, setOpen] = useState(false);
  const left = selected ? businessDaysLeft(todayDate, selected, closedDays) : undefined;

  return (
    <div>
      <label className="label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        readOnly
        value={value ?? ''}
        placeholder="YYYY-MM-DD"
        onClick={() => setOpen((current) => !current)}
        className="mt-1 h-[var(--input-h)] w-full rounded-sm border border-line-2 bg-bg-2 px-2 outline-none focus:border-line-3 focus:shadow-[var(--glow-sm)]"
      />
      {past ? <p className="mt-1 text-down">Date is in the past</p> : null}
      {left !== undefined && !past ? (
        <p className="mt-1 text-fg-2">{left} business days left</p>
      ) : null}
      {open ? (
        <Calendar
          today={todayDate}
          selected={selected}
          disableWeekends={disableWeekends}
          closedDays={closedDays}
          onPick={(date) => {
            onValueChange(format(date, 'yyyy-MM-dd'));
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function Calendar({
  today,
  selected,
  disableWeekends,
  closedDays,
  onPick,
}: {
  today: Date;
  selected?: Date;
  disableWeekends: boolean;
  closedDays: readonly ClosedDay[];
  onPick: (date: Date) => void;
}) {
  const [month, setMonth] = useState(startOfMonth(selected ?? today));
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  });
  const closed = new Map(closedDays.map((day) => [day.date, day.reason]));

  return (
    <div className="mt-2 w-64 rounded-lg border border-line-2 bg-bg-1 p-3">
      <div className="mb-2 flex items-center justify-between">
        <IconButton label="Previous month" size="sm" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft strokeWidth={1.5} className="size-4" />
        </IconButton>
        <p className="font-medium">{format(month, 'MMMM yyyy')}</p>
        <IconButton label="Next month" size="sm" onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight strokeWidth={1.5} className="size-4" />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-fg-3">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
          <span key={day}>{day}</span>
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const reason = closed.get(key);
          const weekend = disableWeekends && isWeekend(day);
          const disabled = Boolean(reason) || weekend;
          const cell = (
            <button
              type="button"
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (!disabled) onPick(day);
              }}
              className={cx(
                'h-7 w-full rounded-xs outline-none focus-visible:shadow-[var(--glow-sm)]',
                !isSameMonth(day, month) && 'text-fg-4',
                selected && isSameDay(day, selected) && 'bg-orange-500 text-bg-0',
                isSameDay(day, today) && 'border border-line-3',
                disabled && 'cursor-not-allowed text-fg-4 line-through',
              )}
            >
              {format(day, 'd')}
            </button>
          );
          if (!reason) return <span key={key}>{cell}</span>;
          return (
            <Tooltip key={key} content={reason}>
              <span className="block">{cell}</span>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function businessDaysLeft(
  today: Date,
  date: Date,
  closedDays: readonly ClosedDay[],
): number {
  const span = differenceInBusinessDays(date, today);
  const skipped = closedDays.filter((day) => {
    const parsed = parseISO(day.date);
    return !isWeekend(parsed) && parsed > today && parsed <= date;
  }).length;
  return Math.max(0, span - skipped);
}
