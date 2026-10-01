import type { FailureCategory, TransferStatus } from '@/contracts/airwallex';
import { cx } from '@/ui/primitives/cx';
import {
  TRANSFER_STEPS,
  transferNextStep,
  transferStatusLabel,
  transferStepIndex,
} from '@/ui/trading/measure';

export function TransferStatusPill({
  status,
  category,
  lateFailure = false,
}: {
  status: TransferStatus;
  category?: FailureCategory;
  lateFailure?: boolean;
}) {
  const label = transferStatusLabel(status, { category, lateFailure });
  const step = lateFailure ? 3 : transferStepIndex(status);
  const failed = lateFailure || status === 'FAILED' || status === 'CANCELLED' || status === 'OVERDUE';
  const tone =
    lateFailure || status === 'FAILED' || status === 'OVERDUE'
      ? 'text-down'
      : status === 'PAID'
        ? 'text-up'
        : status === 'CANCELLED'
          ? 'text-fg-3'
          : 'text-warn';
  return (
    <span className="inline-flex flex-col gap-1">
      <span className={cx('inline-flex items-center gap-2 text-[13px]', tone)}>
        <span>{label}</span>
        {step >= 0 ? (
          <span className="inline-flex items-center gap-1" aria-hidden>
            {TRANSFER_STEPS.map((name, index) => (
              <span
                key={name}
                className={cx(
                  'size-1.5 rounded-full',
                  index <= step
                    ? failed
                      ? 'bg-down'
                      : index === step
                        ? 'bg-orange-500'
                        : 'bg-up'
                    : 'bg-bg-3',
                )}
              />
            ))}
          </span>
        ) : null}
      </span>
      {status === 'FAILED' && category ? (
        <span className="text-fg-2">{transferNextStep(category)}</span>
      ) : null}
    </span>
  );
}
