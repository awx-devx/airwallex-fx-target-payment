'use client';

import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cx } from '@/ui/primitives/cx';
import { Spinner } from '@/ui/primitives/spinner';
import { Tooltip } from '@/ui/primitives/tooltip';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select',
  size = 'md',
  label,
  disabled = false,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  size?: 'sm' | 'md';
  label: string;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={label}
        className={cx(
          'inline-flex w-full items-center justify-between gap-2 rounded-sm border border-line-2 bg-bg-2 px-2 text-fg-1 outline-none',
          'focus-visible:border-line-3 focus-visible:shadow-[var(--glow-sm)]',
          'disabled:opacity-40',
          size === 'sm' ? 'h-[calc(var(--input-h)-4px)] text-xs' : 'h-[var(--input-h)] text-[13px]',
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown strokeWidth={1.5} className="size-3.5 text-fg-3" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          className="z-50 max-h-64 w-[var(--radix-select-trigger-width)] overflow-auto rounded-lg border border-line-2 bg-bg-2 p-1"
        >
          <SelectPrimitive.Viewport>
            {options.length === 0 ? (
              <p className="px-2 py-2 text-fg-3">No results</p>
            ) : (
              options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-bg-3"
                >
                  {option.icon}
                  <span className="min-w-0 flex-1">
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    {option.description ? (
                      <span className="block text-fg-3">{option.description}</span>
                    ) : null}
                  </span>
                  <SelectPrimitive.ItemIndicator>
                    <Check strokeWidth={1.5} className="size-3.5 text-orange-300" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export interface SearchResult {
  options: readonly SelectOption[];
  truncated?: boolean;
}

export function Combobox({
  value,
  onValueChange,
  options,
  onSearch,
  placeholder = 'Search',
  size = 'md',
  label,
  empty = 'No results',
  loading = false,
  expanded = false,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  options?: readonly SelectOption[];
  onSearch?: (query: string) => Promise<SearchResult> | SearchResult;
  placeholder?: string;
  size?: 'sm' | 'md';
  label: string;
  empty?: string;
  loading?: boolean;
  expanded?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(expanded);
  const [query, setQuery] = useState('');
  const [asyncResult, setAsyncResult] = useState<SearchResult | null>(null);
  const [pending, setPending] = useState(false);
  const selected = (options ?? asyncResult?.options ?? []).find((option) => option.value === value);

  async function search(next: string) {
    setQuery(next);
    setOpen(true);
    if (!onSearch) return;
    setPending(true);
    const result = await onSearch(next);
    setAsyncResult(result);
    setPending(false);
  }

  const shown = onSearch
    ? (asyncResult?.options ?? [])
    : (options ?? []).filter((option) =>
        option.label.toLowerCase().includes(query.toLowerCase()),
      );
  const truncated = asyncResult?.truncated === true;
  const busy = loading || pending;
  const visible = expanded || open;

  return (
    <div>
      <div
        className={cx(
          'flex items-center gap-2 rounded-sm border border-line-2 bg-bg-2 px-2',
          'focus-within:border-line-3 focus-within:shadow-[var(--glow-sm)]',
          size === 'sm' ? 'h-[calc(var(--input-h)-4px)]' : 'h-[var(--input-h)]',
        )}
      >
        <Search strokeWidth={1.5} className="size-3.5 text-fg-3" />
        <input
          aria-label={label}
          aria-controls={listId}
          aria-expanded={visible}
          role="combobox"
          value={visible ? query : (selected?.label ?? query)}
          placeholder={placeholder}
          onChange={(event) => void search(event.target.value)}
          onFocus={() => setOpen(true)}
          className="h-full min-w-0 flex-1 bg-transparent text-fg-1 outline-none placeholder:text-fg-4"
        />
        {busy ? <Spinner size="xs" /> : null}
      </div>
      <div id={listId} role="listbox" aria-label={label} className="mt-1 max-h-56 overflow-auto">
        {visible ? (
          <OptionList
            options={shown}
            empty={empty}
            truncated={truncated}
            busy={busy}
            onPick={(option) => {
              onValueChange(option.value);
              setQuery('');
              setOpen(false);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function OptionList({
  options,
  empty,
  truncated = false,
  busy = false,
  onPick,
}: {
  options: readonly SelectOption[];
  empty: string;
  truncated?: boolean;
  busy?: boolean;
  onPick: (option: SelectOption) => void;
}) {
  if (busy) return <p className="px-2 py-2 text-fg-3">Searching…</p>;
  return (
    <div className="rounded-sm border border-line-2 bg-bg-2 p-1">
      {options.length === 0 ? <p className="px-2 py-2 text-fg-3">{empty}</p> : null}
      {options.map((option) => {
        const row = (
          <button
            type="button"
            role="option"
            disabled={option.disabled}
            aria-selected={false}
            onClick={() => onPick(option)}
            className="flex w-full items-center gap-2 rounded-xs px-2 py-1.5 text-left outline-none hover:bg-bg-3 focus-visible:bg-bg-3 disabled:opacity-40"
          >
            {option.icon}
            <span className="min-w-0">
              <span className="block">{option.label}</span>
              {option.description ? (
                <span className="block text-fg-3">{option.description}</span>
              ) : null}
            </span>
          </button>
        );
        if (option.disabled && option.description) {
          return (
            <Tooltip key={option.value} content={option.description}>
              <span className="block">{row}</span>
            </Tooltip>
          );
        }
        return (
          <span key={option.value} className="block">
            {row}
          </span>
        );
      })}
      {truncated ? (
        <p className="px-2 py-1.5 text-warn">Keep typing to narrow results</p>
      ) : null}
    </div>
  );
}
