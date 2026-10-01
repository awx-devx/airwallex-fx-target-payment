'use client';

import { Slider as SliderPrimitive } from 'radix-ui';
import { cx } from '@/ui/primitives/cx';

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  ticks,
  glow = false,
  label,
}: {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ticks?: number[];
  glow?: boolean;
  label: string;
}) {
  return (
    <div className="relative w-full pt-2">
      <SliderPrimitive.Root
        value={[value]}
        onValueChange={(next) => {
          const first = next[0];
          if (first !== undefined) onValueChange(first);
        }}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        className="relative flex h-5 w-full touch-none items-center"
      >
        <SliderPrimitive.Track className="relative h-1 grow rounded-full bg-bg-3">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-orange-500" />
          {ticks?.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="absolute top-1/2 size-1 -translate-y-1/2 rounded-full bg-fg-4"
              style={{ left: `${((tick - min) / (max - min)) * 100}%` }}
            />
          ))}
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          className={cx(
            'block size-3.5 rounded-full border border-orange-400 bg-orange-500 outline-none',
            glow
              ? 'shadow-[var(--glow-sm)] focus-visible:shadow-[var(--glow-md)]'
              : 'focus-visible:shadow-[var(--glow-sm)]',
          )}
        />
      </SliderPrimitive.Root>
    </div>
  );
}
