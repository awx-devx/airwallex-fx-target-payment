import { Badge } from '@/ui/primitives/badge';
import { cx } from '@/ui/primitives/cx';

const DOT = {
  high: 'bg-up',
  medium: 'bg-warn',
  low: 'bg-down',
} as const;

export function ExtractionField({
  label,
  value,
  confidence = 'high',
  edited = false,
  missing = false,
}: {
  label: string;
  value?: string;
  confidence?: keyof typeof DOT;
  edited?: boolean;
  missing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className={cx('size-1.5 rounded-full', DOT[confidence])} />
        <span className="text-fg-3">{label}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <span className={missing ? 'text-down' : 'text-fg-1'}>
          {missing || !value ? 'Missing' : value}
        </span>
        {edited ? (
          <Badge size="xs" tone="orange">
            Edited
          </Badge>
        ) : null}
      </span>
    </div>
  );
}
