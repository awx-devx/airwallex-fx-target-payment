'use client';

import { D } from '@/contracts/money';
import { formatMoney } from '@/ui/format';
import { commitAmount } from '@/ui/primitives/amount';
import { Button } from '@/ui/primitives/button';
import { useState } from 'react';

function grouped(currency: string, value: string): string {
  if (!value) return '';
  return formatMoney(currency, value).slice(0, -(currency.length + 1));
}

export function AmountInput({
  currency,
  value,
  onValueChange,
  size = 'md',
  balance,
  fxLimit,
  invalid,
  label = 'Amount',
}: {
  currency: string;
  value: string;
  onValueChange: (value: string) => void;
  size?: 'md' | 'lg';
  balance?: string;
  fxLimit?: { min: string; max: string };
  invalid?: boolean;
  label?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? grouped(currency, value);
  let message: { tone: 'down' | 'warn'; text: string } | null = null;
  if (invalid || (draft !== null && commitAmount(draft, currency) === null && draft !== '')) {
    message = { tone: 'down', text: 'Enter an amount' };
  } else if (value && balance && D(value).greaterThan(D(balance))) {
    message = {
      tone: 'warn',
      text: `Over balance · ${formatMoney(currency, balance)} available`,
    };
  } else if (
    value &&
    fxLimit &&
    (D(value).lessThan(D(fxLimit.min)) || D(value).greaterThan(D(fxLimit.max)))
  ) {
    message = {
      tone: 'warn',
      text: `Outside FX limits (${formatMoney(currency, fxLimit.min)}–${formatMoney(currency, fxLimit.max)})`,
    };
  }

  return (
    <label className="block">
      <span className="label">{label}</span>
      <span
        className="mt-1 flex items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-2 focus-within:border-line-3 focus-within:shadow-[var(--glow-sm)]"
        style={{
          height: size === 'lg' ? 'calc(var(--input-h) + 8px)' : 'var(--input-h)',
        }}
      >
        <input
          inputMode="decimal"
          aria-label={label}
          value={shown}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft === null) return;
            const next = commitAmount(draft, currency);
            setDraft(null);
            if (next !== null) onValueChange(next);
          }}
          className="num h-full min-w-0 flex-1 bg-transparent text-fg-1 outline-none"
        />
        <span className="text-fg-3">{currency}</span>
        {balance ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onValueChange(balance)}
          >
            Max
          </Button>
        ) : null}
      </span>
      {message ? (
        <span className={message.tone === 'down' ? 'mt-1 block text-down' : 'mt-1 block text-warn'}>
          {message.text}
        </span>
      ) : null}
    </label>
  );
}
