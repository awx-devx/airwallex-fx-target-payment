import { cx } from '@/ui/primitives/cx';

export function Skeleton({
  variant = 'line',
  className,
}: {
  variant?: 'line' | 'block' | 'circle' | 'chart';
  className?: string;
}) {
  if (variant === 'chart') {
    return (
      <div className={cx('skeleton h-32 w-full rounded-md', className)} aria-hidden />
    );
  }
  return (
    <div
      aria-hidden
      className={cx(
        'skeleton',
        variant === 'line' && 'h-3 w-full rounded-xs',
        variant === 'block' && 'h-16 w-full rounded-md',
        variant === 'circle' && 'size-8 rounded-full',
        className,
      )}
    />
  );
}
