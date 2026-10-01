import type { BillState } from '@/contracts/bill';
import { Badge } from '@/ui/primitives/badge';
import { Spinner } from '@/ui/primitives/spinner';
import { STATE_META } from '@/ui/trading/state-meta';

export function StateBadge({ state }: { state: BillState }) {
  const meta = STATE_META[state];
  return (
    <Badge tone={meta.tone} dot pulse={meta.pulse}>
      {meta.busy ? <Spinner size="xs" label={meta.label} /> : null}
      {meta.label}
    </Badge>
  );
}
