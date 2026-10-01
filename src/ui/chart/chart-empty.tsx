export function ChartEmpty({ message = 'No ticks yet' }: { message?: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-fg-3">
      <svg viewBox="0 0 160 56" className="h-14 w-40 text-fg-4" aria-hidden>
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          points="4,40 36,34 68,38 100,22 132,26 156,18"
        />
        <circle cx="156" cy="18" r="3.5" className="fill-orange-500" />
      </svg>
      <p>{message}</p>
    </div>
  );
}
