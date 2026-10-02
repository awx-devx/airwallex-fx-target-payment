'use client';

import type { BalanceSummary } from '@/contracts/airwallex';
import type { Role } from '@/contracts/bill';
import { Bell } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/ui/primitives/button';
import { SegmentedControl } from '@/ui/primitives/segmented';
import { BalancePill } from '@/ui/trading/balance-pill';
import { ConnectionIndicator } from '@/ui/trading/connection-indicator';
import { formatUtcDate } from '@/ui/trading/time-label';

type Connection = 'live' | 'delayed' | 'offline' | 'simulated';

export function TopBar({
  balances,
  connection = 'live',
  unread = 0,
  role,
  onRoleChange,
  now,
  warp,
  onNotifications,
  actions,
  leading,
  trailing,
  divider = true,
}: {
  balances: readonly BalanceSummary[];
  connection?: Connection;
  unread?: number;
  role: Role;
  onRoleChange?: (role: Role) => void;
  now: string;
  warp?: string;
  onNotifications?: () => void;
  actions?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** When false the caller draws the rule, so it can run past the sheet. */
  divider?: boolean;
}) {
  const shown = balances.slice(0, 4);
  return (
    <header
      className={
        divider
          ? 'flex h-11 items-center gap-2 overflow-hidden border-b border-line-1 bg-bg-0 px-2 sm:px-4'
          : 'flex h-11 items-center gap-2 overflow-hidden bg-transparent px-2 sm:px-4'
      }
    >
      {leading}
      <img
        src="/logomark.svg"
        alt="FX Target Bill Payment"
        className="size-5.5 shrink-0"
      />
      <div className="hidden min-w-0 items-center gap-1.5 xl:flex">
        {shown.map((balance, index) => (
          <BalancePill
            key={balance.currency}
            balance={balance}
            tone={index === 0 && connection === 'offline' ? 'low' : 'normal'}
          />
        ))}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {actions}
        <span className="hidden lg:inline-flex">
          <ConnectionIndicator state={connection} />
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-label={unread > 0 ? `${unread} notifications` : 'Notifications'}
          onClick={onNotifications}
          icon={<Bell strokeWidth={1.5} className="size-3.5" />}
        >
          {unread > 0 ? (
            <span className="num">{unread}</span>
          ) : (
            <span className="hidden xl:inline">Alerts</span>
          )}
        </Button>
        {/* DEMO-ONLY: anyone can switch role. PROD: the role comes from auth. */}
        <div className="hidden xl:block">
          <RoleSwitch role={role} onRoleChange={onRoleChange} />
        </div>
        <p className="num hidden text-xs whitespace-nowrap text-fg-2 md:block">
          {formatUtcDate(now, 'day-time')}
          {warp ? <span className="text-orange-300"> · {warp}</span> : null}
        </p>
        {trailing}
      </div>
    </header>
  );
}

/** Balances, connection, and role when the top bar has collapsed them. */
export function AccountStrip({
  balances,
  connection = 'live',
  role,
  onRoleChange,
  now,
}: {
  balances: readonly BalanceSummary[];
  connection?: Connection;
  role: Role;
  onRoleChange?: (role: Role) => void;
  now: string;
}) {
  return (
    <div className="shrink-0 space-y-2 border-b border-line-1 px-3 py-2">
      <div className="flex flex-wrap gap-1.5">
        {balances.slice(0, 4).map((balance, index) => (
          <BalancePill
            key={balance.currency}
            balance={balance}
            tone={index === 0 && connection === 'offline' ? 'low' : 'normal'}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ConnectionIndicator state={connection} />
        <RoleSwitch role={role} onRoleChange={onRoleChange} />
        <p className="num ml-auto text-xs whitespace-nowrap text-fg-3 lg:hidden">
          {formatUtcDate(now, 'day-time')}
        </p>
      </div>
    </div>
  );
}

function RoleSwitch({
  role,
  onRoleChange,
}: {
  role: Role;
  onRoleChange?: (role: Role) => void;
}) {
  return (
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
  );
}
