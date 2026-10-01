'use client';

import { Checkbox as CheckboxPrimitive, RadioGroup, Switch as SwitchPrimitive } from 'radix-ui';
import { Check, Minus } from 'lucide-react';
import { cx } from '@/ui/primitives/cx';

const BOX = {
  sm: 'size-3.5',
  md: 'size-4',
} as const;

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  size = 'md',
  disabled = false,
}: {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  return (
    <label className={cx('inline-flex items-center gap-2', disabled && 'opacity-40')}>
      <CheckboxPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cx(
          'inline-flex items-center justify-center rounded-xs border border-line-2 bg-bg-2 text-bg-0 outline-none',
          'focus-visible:shadow-[var(--glow-sm)] data-[state=checked]:border-orange-500 data-[state=checked]:bg-orange-500',
          'data-[state=indeterminate]:border-orange-500 data-[state=indeterminate]:bg-orange-500',
          BOX[size],
        )}
      >
        <CheckboxPrimitive.Indicator>
          {checked === 'indeterminate' ? (
            <Minus strokeWidth={1.5} className="size-3" />
          ) : (
            <Check strokeWidth={1.5} className="size-3" />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label}
    </label>
  );
}

export function Radio({
  value,
  onValueChange,
  options,
  size = 'md',
  label,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  size?: 'sm' | 'md';
  label: string;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={onValueChange}
      aria-label={label}
      className="flex flex-col gap-2"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className={cx('inline-flex items-center gap-2', option.disabled && 'opacity-40')}
        >
          <RadioGroup.Item
            value={option.value}
            disabled={option.disabled}
            className={cx(
              'inline-flex items-center justify-center rounded-full border border-line-2 bg-bg-2 outline-none',
              'focus-visible:shadow-[var(--glow-sm)] data-[state=checked]:border-orange-500',
              BOX[size],
            )}
          >
            <RadioGroup.Indicator className="size-1.5 rounded-full bg-orange-500" />
          </RadioGroup.Item>
          {option.label}
        </label>
      ))}
    </RadioGroup.Root>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  size = 'md',
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  return (
    <label className={cx('inline-flex items-center gap-2', disabled && 'opacity-40')}>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
          className={cx(
            'relative rounded-full border border-line-2 bg-bg-3 outline-none',
          'focus-visible:shadow-[var(--glow-sm)] data-[state=checked]:border-orange-500 data-[state=checked]:bg-orange-500',
          size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
        )}
      >
        <SwitchPrimitive.Thumb
          className={cx(
            'block rounded-full bg-fg-1 transition-transform',
            size === 'sm' ? 'size-3 data-[state=checked]:translate-x-3' : 'size-3.5 data-[state=checked]:translate-x-4',
            'translate-x-0.5',
          )}
        />
      </SwitchPrimitive.Root>
      {label}
    </label>
  );
}
