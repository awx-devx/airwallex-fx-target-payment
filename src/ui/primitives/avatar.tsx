import { cx } from '@/ui/primitives/cx';

export function Avatar({
  name,
  src,
  size = 'sm',
  approver = false,
}: {
  name: string;
  src?: string;
  size?: 'xs' | 'sm';
  approver?: boolean;
}) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center overflow-hidden rounded-full bg-bg-3 font-medium text-fg-1',
        size === 'xs' ? 'size-5 text-[10px]' : 'size-7 text-xs',
        approver && 'ring-1 ring-orange-500',
      )}
    >
      {src ? (
        <span
          aria-hidden
          className="size-full bg-cover"
          style={{ backgroundImage: `url("${src}")` }}
        />
      ) : (
        initials
      )}
    </span>
  );
}
