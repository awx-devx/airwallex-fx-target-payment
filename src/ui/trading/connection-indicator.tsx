import { cx } from '@/ui/primitives/cx';

const VIEW = {
  live: { label: 'Live', dot: 'bg-up glow-pulse', text: 'text-up' },
  delayed: { label: 'Delayed', dot: 'bg-warn', text: 'text-warn' },
  offline: { label: 'Offline', dot: 'bg-down', text: 'text-down' },
  simulated: { label: 'Simulated', dot: 'bg-orange-500', text: 'text-orange-300' },
} as const;

export function ConnectionIndicator({
  state,
}: {
  state: keyof typeof VIEW;
}) {
  const view = VIEW[state];
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-medium', view.text)}>
      <span aria-hidden className={cx('size-1.5 rounded-full', view.dot)} />
      {view.label}
    </span>
  );
}
