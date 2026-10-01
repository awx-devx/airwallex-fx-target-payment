import { D, decimalString } from '@/contracts/money';
import { favorable } from '@/ui/format';
import { Skeleton } from '@/ui/primitives/skeleton';
import { DIRECTION_TEXT } from '@/ui/trading/direction';

export function Sparkline({
  points,
  target,
  loading = false,
}: {
  points: readonly string[];
  target?: string;
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-8 w-24" />;
  if (points.length < 2) return <span className="text-fg-3">No ticks</span>;
  const first = points[0] ?? '0';
  const last = points[points.length - 1] ?? first;
  const direction = favorable(decimalString(D(last).minus(D(first))));
  const nums = points.map((point) => D(point));
  const min = nums.reduce((low, point) => (point.lessThan(low) ? point : low), nums[0] ?? D(first));
  const max = nums.reduce((high, point) => (point.greaterThan(high) ? point : high), nums[0] ?? D(first));
  const span = max.minus(min);
  const coords = nums.map((point, index) => {
    const x = (index / (nums.length - 1)) * 100;
    const y = span.isZero()
      ? 16
      : 28 - point.minus(min).div(span).mul(24).toNumber();
    return `${x},${y}`;
  });
  const hit = target ? !D(last).greaterThan(D(target)) : false;
  const targetY =
    target && !span.isZero()
      ? 28 - D(target).minus(min).div(span).mul(24).toNumber()
      : undefined;
  return (
    <svg viewBox="0 0 100 32" className={`h-8 w-24 ${DIRECTION_TEXT[direction]}`} aria-hidden>
      {targetY !== undefined ? (
        <line
          x1="0"
          x2="100"
          y1={targetY}
          y2={targetY}
          stroke="currentColor"
          className="text-orange-500"
          strokeWidth="1"
        />
      ) : null}
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={coords.join(' ')} />
      <circle
        cx="100"
        cy={coords.at(-1)?.split(',')[1]}
        r="2"
        className={hit ? 'fill-orange-500' : 'fill-current'}
      />
    </svg>
  );
}
