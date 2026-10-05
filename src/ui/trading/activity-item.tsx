import type { BillEvent, BillEventType } from '@/contracts/events';
import {
  AlarmClock,
  Ban,
  Check,
  CirclePause,
  CirclePlay,
  FastForward,
  Flag,
  Lock,
  Pencil,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatUtcDate } from '@/ui/trading/time-label';

const COPY: Record<BillEventType, { text: string; icon: LucideIcon }> = {
  ARMED: { text: 'Armed', icon: Flag },
  TICK_CROSSED: { text: 'Price crossed the target', icon: Target },
  QUOTE_LOCKED: { text: 'Target hit · paying', icon: Lock },
  NEAR_MISS: { text: 'Near miss', icon: Target },
  QUOTE_EXPIRED: { text: 'Quote expired', icon: AlarmClock },
  AUTOSETTLE: { text: 'Paying at the deadline', icon: Check },
  CANCELLED: { text: 'Cancelled', icon: X },
  TRANSFER_CREATED: { text: 'Transfer created', icon: RefreshCw },
  TRANSFER_STATUS: { text: 'Transfer status updated', icon: RefreshCw },
  PAID: { text: 'Paid', icon: Check },
  FAILED: { text: 'Failed', icon: ShieldAlert },
  STRATEGY_UPDATED: { text: 'Strategy updated', icon: Pencil },
  PAUSED: { text: 'Paused', icon: CirclePause },
  RESUMED: { text: 'Resumed', icon: CirclePlay },
  REARMED: { text: 'Ready to arm again', icon: RefreshCw },
  CATCH_UP: { text: 'Caught up after a restart', icon: FastForward },
  // DEMO-ONLY: simulation markers exist only for the Simulate run.
  // PROD: the activity feed has no simulation events.
  SIM_STARTED: { text: 'Simulation started', icon: Sparkles },
  SIM_ENDED: { text: 'Simulation ended', icon: Ban },
};

export function ActivityItem({ event }: { event: BillEvent }) {
  const view = COPY[event.type];
  const Icon = view.icon;
  return (
    <div className="flex items-start gap-2 text-[13px]">
      <span className="mt-0.5 text-fg-3">
        <Icon strokeWidth={1.5} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{view.text}</span>
        <span className="text-fg-3">
          {formatUtcDate(event.ts, 'day-time')} · {event.actor}
        </span>
      </span>
    </div>
  );
}
