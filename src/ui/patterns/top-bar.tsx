'use client';

import type { BalanceSummary } from '@/contracts/airwallex';
import type { Role } from '@/contracts/bill';
import { Bell } from 'lucide-react';
import { Button } from '@/ui/primitives/button';
import { SegmentedControl } from '@/ui/primitives/segmented';
import { BalancePill } from '@/ui/trading/balance-pill';
import { ConnectionIndicator } from '@/ui/trading/connection-indicator';
import { EnvBadge } from '@/ui/trading/env-badge';
import { formatUtcDate } from '@/ui/trading/time-label';

export function TopBar({
  env = 'SANDBOX',
  balances,
  connection = 'live',
  unread = 0,
  role,
  onRoleChange,
  now,
  warp,
  onNotifications,
}: {
  env?: 'SANDBOX' | 'PRODUCTION' | 'DEMO';
  balances: readonly BalanceSummary[];
  connection?: 'live' | 'delayed' | 'offline' | 'simulated';
  unread?: number;
  role: Role;
  onRoleChange?: (role: Role) => void;
  now: string;
  warp?: string;
  onNotifications?: () => void;
}) {
  const shown = balances.slice(0, 4);
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line-1 bg-bg-0 px-4 py-2">
      <p className="text-sm font-medium tracking-tight">FX Target</p>
      <EnvBadge env={env} />
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((balance, index) => (
          <BalancePill
            key={balance.currency}
            balance={balance}
            tone={index === 0 && connection === 'offline' ? 'low' : 'normal'}
          />
        ))}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3">
        <ConnectionIndicator state={connection} />
        <Button
          variant="ghost"
          size="sm"
          aria-label={unread > 0 ? `${unread} notifications` : 'Notifications'}
          onClick={onNotifications}
          icon={<Bell strokeWidth={1.5} className="size-3.5" />}
        >
          {unread > 0 ? String(unread) : 'Alerts'}
        </Button>
        {/* DEMO-ONLY: anyone can switch role. PROD: the role comes from auth. */}
        <SegmentedControl
          label="Role"
          size="sm"
          value={role}
          onValueChange={(next) => onRoleChange?.(next)}
          options={[
            { value: 'preparer', label: 'Preparer' },
            { value: 'approver', label: 'Approver' },
          ]}
        />
        <p className="num text-xs text-fg-2">
          {formatUtcDate(now, 'day-time')}
          {warp ? <span className="text-orange-300"> · {warp}</span> : null}
        </p>
      </div>
    </header>
  );
}
