export function runLoop(
  signal: AbortSignal,
  intervalMs: number,
  tick: () => Promise<void>,
  onError: (error: unknown) => void,
): void {
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (signal.aborted) return;
    timer = setTimeout(() => {
      void tick().catch(onError).finally(schedule);
    }, intervalMs);
  };
  signal.addEventListener(
    'abort',
    () => {
      if (timer) clearTimeout(timer);
    },
    { once: true },
  );
  void tick().catch(onError).finally(schedule);
}
