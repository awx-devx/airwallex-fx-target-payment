import { cx } from '@/ui/primitives/cx';

export function fieldClass({
  size = 'md',
  error = false,
  disabled = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  error?: boolean;
  disabled?: boolean;
} = {}): string {
  return cx(
    'w-full rounded-sm border bg-bg-2 text-fg-1 outline-none',
    'placeholder:text-fg-4',
    'focus:border-line-3 focus:shadow-[var(--glow-sm)]',
    'read-only:text-fg-2',
    error ? 'border-down' : 'border-line-2',
    disabled && 'pointer-events-none opacity-40',
    size === 'sm' && 'h-[calc(var(--input-h)-4px)] px-2 text-xs',
    size === 'md' && 'h-[var(--input-h)] px-2 text-[13px]',
    size === 'lg' && 'h-[calc(var(--input-h)+8px)] px-3 text-sm',
  );
}
