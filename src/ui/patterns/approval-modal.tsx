'use client';

import type { BillSummary, Role } from '@/contracts/bill';
import { Button } from '@/ui/primitives/button';
import { Dialog, DialogPreview } from '@/ui/primitives/dialog';
import { ApprovalCard } from '@/ui/patterns/approval-card';

export function ApprovalModal({
  open,
  onOpenChange,
  bill,
  now,
  role,
  homeCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: BillSummary;
  now: string;
  role?: Role;
  homeCurrency: string;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={bill.vendorName}
      description="Approval"
      tone="glow"
      size="lg"
      trigger={<Button>Open approval</Button>}
    >
      <ApprovalCard bill={bill} now={now} role={role} homeCurrency={homeCurrency} />
    </Dialog>
  );
}

export function ApprovalModalPreview({
  bill,
  now,
  role,
  homeCurrency,
}: {
  bill: BillSummary;
  now: string;
  role?: Role;
  homeCurrency: string;
}) {
  return (
    <DialogPreview title={bill.vendorName} description="Approval" tone="glow" size="lg">
      <ApprovalCard bill={bill} now={now} role={role} homeCurrency={homeCurrency} />
    </DialogPreview>
  );
}
