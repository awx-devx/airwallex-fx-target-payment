'use client';

import type { BeneficiarySummary } from '@/contracts/airwallex';
import { Badge } from '@/ui/primitives/badge';
import { Card } from '@/ui/primitives/card';
import { Checkbox } from '@/ui/primitives/choice';
import { verificationView } from '@/ui/trading/verification';

const TONE = {
  up: 'up',
  warn: 'warn',
  down: 'down',
  muted: 'muted',
} as const;

export function BeneficiaryCard({
  beneficiary,
  missing = [],
  error,
  confirmed = false,
  onConfirmedChange,
}: {
  beneficiary?: BeneficiarySummary;
  missing?: readonly string[];
  error?: string;
  confirmed?: boolean;
  onConfirmedChange?: (confirmed: boolean) => void;
}) {
  const view = verificationView(beneficiary?.verification);
  return (
    <Card className="max-w-sm">
      {beneficiary ? (
        <>
          <p className="font-medium">{beneficiary.name}</p>
          <p className="text-fg-2">
            {beneficiary.bankName ?? 'Bank unknown'} · {beneficiary.maskedAccount}
          </p>
          <p className="text-fg-3">
            {beneficiary.accountCurrency} · {beneficiary.transferMethods.join(' · ')}
          </p>
          <div className="mt-2">
            <Badge tone={TONE[view.tone]}>{view.label}</Badge>
          </div>
          {view.confirm === 'confirm' || view.confirm === 'danger' ? (
            <div className={view.confirm === 'danger' ? 'mt-3 text-down' : 'mt-3'}>
              <Checkbox
                label="I've confirmed with the vendor"
                checked={confirmed}
                onCheckedChange={(next) => onConfirmedChange?.(next === true)}
              />
            </div>
          ) : null}
          {view.confirm === 'blocked' ? (
            <p className="mt-2 text-down">Arming is blocked. Airwallex will reject this account.</p>
          ) : null}
        </>
      ) : (
        <p className="text-fg-2">No beneficiary yet</p>
      )}
      {missing.length > 0 ? (
        <p className="mt-2 text-warn">Missing {missing.join(', ')}</p>
      ) : null}
      {error ? <p className="mt-2 text-down">{error}</p> : null}
    </Card>
  );
}
