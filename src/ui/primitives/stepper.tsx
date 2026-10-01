import { cx } from '@/ui/primitives/cx';

export function Stepper({
  steps,
}: {
  steps: ReadonlyArray<{
    label: string;
    state: 'current' | 'complete' | 'error' | 'upcoming';
  }>;
}) {
  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-3">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-3">
          <span
            className={cx(
              'inline-flex size-6 items-center justify-center rounded-full border text-[11px]',
              step.state === 'current' && 'border-orange-500 text-orange-300 shadow-[var(--glow-sm)]',
              step.state === 'complete' && 'border-up bg-up text-bg-0',
              step.state === 'error' && 'border-down text-down',
              step.state === 'upcoming' && 'border-line-2 text-fg-3',
            )}
          >
            {index + 1}
          </span>
          <span className={step.state === 'upcoming' ? 'text-fg-3' : undefined}>{step.label}</span>
          {index < steps.length - 1 ? <span className="h-px w-8 bg-line-2" /> : null}
        </li>
      ))}
    </ol>
  );
}
