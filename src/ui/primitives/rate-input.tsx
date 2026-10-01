'use client';

import { D } from '@/contracts/money';
import {
  favorable,
  formatPair,
  formatPrice,
  type CurrencyPair,
} from '@/ui/format';
import { Button } from '@/ui/primitives/button';
import { stepPrice } from '@/ui/primitives/rate';
import { useState } from 'react';

export function RateInput({
  pair,
  value,
  onValueChange,
  inverted = false,
  onInvertedChange,
  entry,
  size = 'md',
  label = 'Target rate',
}: {
  pair: CurrencyPair;
  value: string;
  onValueChange: (canonical: string) => void;
  inverted?: boolean;
  onInvertedChange?: (inverted: boolean) => void;
  entry?: string;
  size?: 'md' | 'lg';
  label?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatPrice(pair, value, { inverted });
  const hint = entry ? hintFor(value, entry) : null;

  function commit(raw: string) {
    const next = raw.trim();
    setDraft(null);
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(next)) return;
    onValueChange(inverted ? D('1').div(D(next)).toString() : next);
  }

  function step(pips: number) {
    setDraft(null);
    onValueChange(stepPrice(value, pair, inverted, pips));
  }

  return (
    <label className="block">
      <span className="label">{label}</span>
      <span
        className="mt-1 flex items-center gap-1 rounded-sm border border-line-2 bg-bg-2 px-2 focus-within:border-line-3 focus-within:shadow-[var(--glow-sm)]"
        style={{
          height: size === 'lg' ? 'calc(var(--input-h) + 8px)' : 'var(--input-h)',
        }}
      >
        <span className="text-fg-3">{formatPair(pair, { inverted })}</span>
        <input
          aria-label={label}
          value={shown}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== null) commit(draft);
          }}
          className="num h-full min-w-0 flex-1 bg-transparent text-fg-1 outline-none"
        />
        <Button variant="ghost" size="xs" onClick={() => step(-10)}>
          −10
        </Button>
        <Button variant="ghost" size="xs" onClick={() => step(-1)}>
          −1
        </Button>
        <Button variant="ghost" size="xs" onClick={() => step(1)}>
          +1
        </Button>
        <Button variant="ghost" size="xs" onClick={() => step(10)}>
          +10
        </Button>
        {onInvertedChange ? (
          <Button
            variant={inverted ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={inverted}
            onClick={() => onInvertedChange(!inverted)}
          >
            Invert
          </Button>
        ) : null}
      </span>
      {hint ? <span className={`mt-1 block ${hint.className}`}>{hint.text}</span> : null}
    </label>
  );
}

function hintFor(value: string, entry: string): { text: string; className: string } | null {
  const direction = favorable(D(value).minus(D(entry)).toString());
  if (direction === 'neutral') return { text: 'At entry', className: 'text-fg-3' };
  if (direction === 'favorable') {
    return { text: 'Below entry', className: 'text-up' };
  }
  return { text: 'Above entry', className: 'text-down' };
}
