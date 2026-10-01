import { Separator } from 'radix-ui';
import { cx } from '@/ui/primitives/cx';

export function Divider({
  orientation = 'horizontal',
  label,
}: {
  orientation?: 'horizontal' | 'vertical';
  label?: string;
}) {
  if (label && orientation === 'horizontal') {
    return (
      <div className="flex items-center gap-3 text-fg-3">
        <Separator.Root className="h-px flex-1 bg-line-2" />
        <span className="label">{label}</span>
        <Separator.Root className="h-px flex-1 bg-line-2" />
      </div>
    );
  }
  return (
    <Separator.Root
      orientation={orientation}
      className={cx(
        'bg-line-2',
        orientation === 'vertical' ? 'h-full w-px' : 'h-px w-full',
      )}
    />
  );
}
