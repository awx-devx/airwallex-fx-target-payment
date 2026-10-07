'use client';

import type { TransferMethod } from '@/contracts/airwallex';
import { cx } from '@/ui/primitives/cx';
import {
  flightLabel,
  limitLabel,
  overLimitReason,
  type TransferMethodOption,
} from '@/ui/primitives/transfer-method';

export function TransferMethodPicker({
  value,
  onValueChange,
  options,
  amount,
  label = 'Transfer method',
}: {
  value?: TransferMethod;
  onValueChange: (method: TransferMethod) => void;
  options: readonly TransferMethodOption[];
  amount?: string;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2">
      {options.map((option) => {
        const other = options.find((item) => item.method !== option.method)?.method;
        const blocked = option.unavailable ?? overLimitReason(option, amount, other);
        const selected = option.method === value;
        const detail = [flightLabel(option), limitLabel(option)].filter(Boolean).join(' · ');
        return (
          <button
            key={option.method}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={Boolean(blocked)}
            onClick={() => onValueChange(option.method)}
            className={cx(
              'rounded-md border px-3 py-2 text-left outline-none',
              'focus-visible:shadow-[var(--glow-sm)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              selected
                ? 'border-orange-500 bg-orange-wash'
                : 'border-line-2 bg-bg-2',
            )}
          >
            <span className="block font-medium">{option.method}</span>
            <span className="block text-fg-2">{detail}</span>
            {blocked ? (
              <span className={option.unavailable ? 'block text-down' : 'block text-warn'}>{blocked}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
