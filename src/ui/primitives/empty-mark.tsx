/** Line-art chart with one orange mark. The empty-state illustration. */
export function EmptyChartMark() {
  return (
    <svg width="72" height="40" viewBox="0 0 72 40" aria-hidden className="text-fg-3">
      <path
        d="M2 30 L16 24 L28 27 L40 16 L52 19 L68 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="52" cy="19" r="2.75" fill="var(--orange-500)" />
    </svg>
  );
}
