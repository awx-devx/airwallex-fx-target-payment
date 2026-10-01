'use client';

import { D } from '@/contracts/money';
import { favorable } from '@/ui/format';
import { useTimeFrozen } from '@/ui/motion/freeze';
import { interpolateDecimal } from '@/ui/motion/interpolate';
import { durTick, durTween, easeOut } from '@/ui/tokens/motion';
import { animate, useMotionValue, useReducedMotion } from 'motion/react';
import { useEffect, useState, useSyncExternalStore } from 'react';

const WASH = {
  favorable: '--up-wash',
  adverse: '--down-wash',
} as const;

/**
 * Background colour that flashes `--up-wash` or `--down-wash` when `value`
 * changes, then fades over `--dur-tick`. A canonical-price decrease is
 * favourable. No flash under reduced motion or while time is frozen.
 */
export function useTickFlash(value: string): {
  backgroundColor: string;
  opacity: ReturnType<typeof useMotionValue<number>>;
} {
  const reduced = useReducedMotion();
  const frozen = useTimeFrozen();
  const opacity = useMotionValue(0);
  const [seen, setSeen] = useState(value);
  const [pending, setPending] = useState<{
    from: string;
    to: string;
  } | null>(null);
  if (value !== seen) {
    setSeen(value);
    setPending({ from: seen, to: value });
  }

  const backgroundColor = washFor(pending, Boolean(reduced) || frozen);

  useEffect(() => {
    if (!backgroundColor) {
      opacity.set(0);
      return;
    }
    opacity.set(1);
    const controls = animate(opacity, 0, {
      duration: durTick,
      ease: easeOut,
    });
    return () => controls.stop();
  }, [backgroundColor, opacity, pending]);

  return { backgroundColor, opacity };
}

function washFor(
  pending: { from: string; to: string } | null,
  suppressed: boolean,
): string {
  if (!pending || suppressed) return 'transparent';
  try {
    const delta = D(pending.to).minus(D(pending.from)).toString();
    const direction = favorable(delta);
    if (direction === 'neutral') return 'transparent';
    return `var(${WASH[direction]})`;
  } catch {
    return 'transparent';
  }
}

interface TweenStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string;
  tweenTo: (next: string, snap: boolean) => void;
  stop: () => void;
}

function createTweenStore(initial: string): TweenStore {
  let snapshot = initial;
  let generation = 0;
  let stopAnimation = () => {};
  const listeners = new Set<() => void>();

  function emit(next: string) {
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function halt() {
    generation += 1;
    const stopCurrent = stopAnimation;
    stopAnimation = () => {};
    stopCurrent();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return snapshot;
    },
    stop: halt,
    tweenTo(next, snap) {
      halt();
      if (snap || next === snapshot) {
        emit(next);
        return;
      }
      const from = snapshot;
      try {
        D(from);
        D(next);
      } catch {
        emit(next);
        return;
      }
      const gen = generation;
      const controls = animate(0, 1, {
        duration: durTween,
        ease: easeOut,
        onUpdate: (progress) => {
          if (gen !== generation) return;
          emit(interpolateDecimal(from, next, progress.toFixed(4)));
        },
        onComplete: () => {
          if (gen !== generation) return;
          emit(next);
        },
      });
      stopAnimation = () => controls.stop();
    },
  };
}

/**
 * Decimal string that eases toward `value` over `--dur-tween`. The settled
 * value is exactly `value`. Snaps under reduced motion or while time is frozen.
 */
export function useTween(value: string): string {
  const reduced = useReducedMotion();
  const frozen = useTimeFrozen();
  const [store] = useState(() => createTweenStore(value));
  const display = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => value,
  );

  useEffect(() => {
    store.tweenTo(value, Boolean(reduced) || frozen);
    return () => store.stop();
  }, [store, frozen, reduced, value]);

  return display;
}
