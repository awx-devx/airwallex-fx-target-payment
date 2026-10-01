'use client';

import {
  CURRENCIES,
  type CurrencyInfo,
} from '@/contracts/currencies';
import { useId, useMemo, useState } from 'react';
import { Flag } from '@/ui/primitives/flag';
import { OptionList, type SelectOption } from '@/ui/primitives/select';
import { Search } from 'lucide-react';

type Mode = 'buy' | 'sell';

function reason(currency: CurrencyInfo, mode: Mode): string | undefined {
  const account = currency.enabledOnAccount;
  if (account && account[mode] === false) {
    return 'Not enabled on this Airwallex account';
  }
  if (mode === 'buy' && !currency.fx.buy) return currency.fx.note ?? 'Not available to buy';
  if (mode === 'sell' && !currency.fx.sell) {
    return currency.fx.note ?? 'Not available to sell';
  }
  return undefined;
}

export function CurrencySelect({
  value,
  onValueChange,
  mode = 'buy',
  currencies = CURRENCIES,
  label = 'Currency',
  expanded = false,
}: {
  value?: string;
  onValueChange: (code: string) => void;
  mode?: Mode;
  currencies?: readonly CurrencyInfo[];
  label?: string;
  expanded?: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(expanded);
  const groups = useMemo(() => groupCurrencies(currencies, mode, query), [currencies, mode, query]);
  const selected = currencies.find((currency) => currency.code === value);
  const visible = expanded || open;

  return (
    <div>
      <div className="flex h-[var(--input-h)] items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-2 focus-within:border-line-3 focus-within:shadow-[var(--glow-sm)]">
        {selected ? <Flag currency={selected.code} /> : <Search strokeWidth={1.5} className="size-3.5 text-fg-3" />}
        <input
          aria-label={label}
          role="combobox"
          aria-controls={listId}
          aria-expanded={visible}
          value={
            visible
              ? query
              : selected
                ? `${selected.code} · ${selected.name}`
                : query
          }
          placeholder="Currency"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-4"
        />
      </div>
      {visible ? (
        <div id={listId} role="listbox" aria-label={label} className="mt-1 max-h-64 space-y-2 overflow-auto">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="label px-2">{group.title}</p>
              <OptionList
                options={group.options}
                empty="No currencies"
                onPick={(option) => {
                  if (option.disabled) return;
                  onValueChange(option.value);
                  setQuery('');
                  setOpen(false);
                }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function groupCurrencies(
  currencies: readonly CurrencyInfo[],
  mode: Mode,
  query: string,
): Array<{ title: string; options: SelectOption[] }> {
  const needle = query.toLowerCase();
  const matching = currencies.filter(
    (currency) =>
      !needle ||
      currency.code.toLowerCase().includes(needle) ||
      currency.name.toLowerCase().includes(needle),
  );
  const pure = matching.filter((currency) => currency.fx.pureConversion);
  const payout = matching.filter((currency) => !currency.fx.pureConversion);
  return [
    { title: 'Pure conversion', options: pure.map((currency) => toOption(currency, mode)) },
    { title: 'Payout only', options: payout.map((currency) => toOption(currency, mode)) },
  ].filter((group) => group.options.length > 0);
}

function toOption(currency: CurrencyInfo, mode: Mode): SelectOption {
  const disabledReason = reason(currency, mode);
  return {
    value: currency.code,
    label: `${currency.code} · ${currency.name}`,
    description: disabledReason ?? currency.fx.note,
    disabled: Boolean(disabledReason),
    icon: <Flag currency={currency.code} />,
  };
}
