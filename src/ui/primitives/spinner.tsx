import { cx } from '@/ui/primitives/cx';

export type SpinnerSize = 'xs' | 'sm' | 'md';

const SIZE = { xs: 'size-3', sm: 'size-3.5', md: 'size-4' } as const;

export function Spinner({
  size = 'sm',
  variant = 'ring',
  label = 'Loading',
}: {
  size?: SpinnerSize;
  variant?: 'ring' | 'dots';
  label?: string;
}) {
  if (variant === 'dots') {
    return (
      <span role="status" aria-label={label} className="inline-flex gap-0.5">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className={cx('rounded-full bg-current', SIZE[size])}
            style={{
              width: size === 'md' ? 5 : 3,
              height: size === 'md' ? 5 : 3,
              opacity: 0.35 + dot * 0.25,
            }}
          />
        ))}
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-label={label}
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-current border-r-transparent',
        SIZE[size],
      )}
    />
  );
}
