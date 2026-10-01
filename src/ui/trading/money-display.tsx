import { formatMoney } from '@/ui/format';
import { cx } from '@/ui/primitives/cx';

const SIZE = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  hero: 'display',
} as const;

export function MoneyDisplay({
  currency,
  value,
  size = 'md',
  signed = false,
  masked = false,
  className,
}: {
  currency: string;
  value: string;
  size?: keyof typeof SIZE;
  signed?: boolean;
  masked?: boolean;
  className?: string;
}) {
  return (
    <span className={cx('num', SIZE[size], className, masked && 'tracking-widest text-fg-3')}>
      {masked ? `•••• ${currency}` : formatMoney(currency, value, { signed })}
    </span>
  );
}
