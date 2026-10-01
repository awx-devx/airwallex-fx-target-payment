import { favorable, formatDelta, type CurrencyPair, type DeltaMode } from '@/ui/format';
import { DIRECTION_TEXT } from '@/ui/trading/direction';

export function DeltaText({
  value,
  mode = 'abs',
  pair,
}: {
  value: string;
  mode?: DeltaMode;
  pair?: CurrencyPair;
}) {
  const direction = favorable(value);
  return (
    <span className={`num ${DIRECTION_TEXT[direction]}`}>
      {formatDelta(value, { mode, pair })}
    </span>
  );
}
